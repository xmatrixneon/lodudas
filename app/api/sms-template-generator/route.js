import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Copy functions from f.mjs
const escapeRegex = (s = "") =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function normalizeToSingleLine(str = "") {
  return str
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSmartOtpRegexList(formats) {
  if (!formats || formats.length === 0) return [];
  if (!Array.isArray(formats)) formats = [formats];

  return formats
    .map((format) => {
      format = normalizeToSingleLine(format);
      if (!format.includes("{otp}")) return null;

      let pattern = escapeRegex(format);

      // First {otp} gets named capture group, subsequent ones get non-capturing group
      // This prevents "Duplicate capture group name" regex errors
      let isFirstOtp = true;
      pattern = pattern.replace(/\\\{otp\\\}/gi, () => {
        if (isFirstOtp) {
          isFirstOtp = false;
          return "(?<otp>[A-Za-z0-9\\-]{3,12})";
        }
        return "(?:[A-Za-z0-9\\-]{3,12})";
      });

      pattern = pattern.replace(/\\\{date\\\}/gi, ".*?");
      pattern = pattern.replace(/\\\{datetime\\\}/gi, ".*?");
      pattern = pattern.replace(/\\\{time\\\}/gi, ".*?");
      pattern = pattern.replace(/\\\{random\\\}/gi, ".+?");
      pattern = pattern.replace(/\\\{.*?\\\}/gi, ".*?");

      pattern = pattern
        .replace(/\\s+/g, "\\s*")
        .replace(/\\:/g, "[:：]?")
        .replace(/\\\./g, ".*?");

      return new RegExp(pattern, "i");
    })
    .filter(Boolean);
}

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
});

export async function POST(request) {
  try {
    const { smsText } = await request.json();

    if (!smsText) {
      return NextResponse.json({ error: 'SMS text is required' }, { status: 400 });
    }

    // Function to validate template against SMS
    const validateTemplate = (template, smsText) => {
      // First check if template has exactly one {otp} placeholder
      const otpCount = (template.match(/{otp}/gi) || []).length;
      if (otpCount === 0) {
        return { valid: false, reason: 'No {otp} placeholder found in template' };
      }
      if (otpCount > 1) {
        return { valid: false, reason: 'Template contains multiple {otp} placeholders. Only one {otp} placeholder is allowed per template.' };
      }

      const regexList = buildSmartOtpRegexList(template);
      if (regexList.length === 0) {
        return { valid: false, reason: 'Failed to build regex from template' };
      }

      const cleanMessage = normalizeToSingleLine(smsText);
      let otpFound = null;

      for (const regex of regexList) {
        try {
          const match = regex.exec(cleanMessage);
          otpFound = match?.groups?.otp || (match && match[1]) || null;
          if (otpFound) {
            break;
          }
        } catch (error) {
          return { valid: false, reason: `Regex error: ${error.message}` };
        }
      }

      if (!otpFound) {
        return { valid: false, reason: 'Could not extract OTP from SMS using the generated template' };
      }

      return { valid: true, otp: otpFound };
    };

    let template;
    let validationResult;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      attempts++;

      const prompt = `
You are an SMS template generator. Convert the SMS to a template by replacing ONLY the OTP CODE (the digits/numbers) with {otp}.

IMPORTANT DISTINCTIONS:
- OTP CODE = numeric code like "791648", "123456" → replace with {otp}
- The word "OTP" in text = keep as-is, do NOT replace
- Use {otp} exactly ONCE in the entire template

Placeholders:
- {otp} - Replace the OTP CODE (digits only) - USE ONLY ONCE
- {time} - For durations like "5 min", "100 secs"
- {any} - For anything else (URLs, random strings, references)

EXAMPLES:

Example 1 - Simple:
SMS: "123456 is your OTP for verification."
Template: "{otp} is your OTP for verification."

Example 2 - MyJio style:
SMS: "791648 is your One time password (OTP) to login to MyJio. Do not share OTP with anyone."
Template: "{otp} is your One time password (OTP) to login to MyJio. Do not share OTP with anyone."

Example 3 - Airtel style:
SMS: "<#> 1770 is your OTP to login. Valid for 100 secs."
Template: "<#> {otp} is your OTP to login. Valid for {time}."

${validationResult && !validationResult.valid ? `PREVIOUS ATTEMPT FAILED: ${validationResult.reason}

${validationResult.reason.includes('multiple {otp}') ? 'You used {otp} multiple times. Use it ONLY ONCE - only for the first OTP code.' : ''}
${validationResult.reason.includes('No {otp}') ? 'You did not use {otp} at all. You MUST replace the OTP CODE (digits like 791648) with {otp}.' : ''}
${validationResult.reason.includes('Could not extract') ? 'Template structure did not match the SMS. Keep the exact same text, just replace the OTP CODE with {otp}.' : ''}

Remember:
- Replace ONLY the numeric OTP code with {otp}
- Keep the word "OTP" in the text as-is
- Use {otp} exactly ONCE` : ''}

YOUR TASK:
SMS: "${smsText}"

Return ONLY the template string. Replace the OTP CODE (the digits) with {otp}. Keep everything else exactly the same.
`;


      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are an SMS template generator. Replace the OTP CODE (numeric digits) with {otp}. Keep the word 'OTP' in text unchanged. Return ONLY the template, no explanations. Use {otp} exactly ONCE."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.3,
      });

      template = completion.choices[0]?.message?.content?.trim();

      console.log(`[Template Gen] Attempt ${attempts}: Generated template = "${template}"`);

      if (!template) {
        console.error('OpenAI API completion response:', JSON.stringify(completion, null, 2));
        throw new Error(`Failed to generate template. API response: ${completion.choices?.length || 0} choices returned`);
      }

      // Clean the template - remove markdown code blocks, quotes, and unwanted characters
      template = template.replace(/^```[a-z]*\n?|\n?```$/gi, '') // Remove markdown code blocks
                        .replace(/^[`'"|\\-]+|[`'"|\\-]+$/g, '') // Remove quotes, pipes, hyphens
                        .replace(/^"+|"+$/g, '') // Remove double quotes (AI wraps response in quotes)
                        .trim();

      // Validate the generated template
      validationResult = validateTemplate(template, smsText);
      console.log(`[Template Gen] Attempt ${attempts}: Validation result =`, validationResult);

    } while (!validationResult.valid && attempts < maxAttempts);

    if (!validationResult.valid) {
      let assistantExplanation = '';

      if (validationResult.reason.includes('multiple')) {
        assistantExplanation = `The AI generated a template with multiple {otp} placeholders, which is not allowed. This usually happens when the SMS contains the OTP multiple times.

Suggested solutions:
1. Try using only the first occurrence of the OTP in your SMS
2. Remove any repeated OTP references from the SMS text
3. If the OTP appears at the end (like #5672), consider omitting that part
4. Example: For "Dear customer, 5672 is your OTP... #5672", use "Dear customer, 5672 is your OTP..."`;

      } else if (validationResult.reason.includes('No {otp}')) {
        assistantExplanation = `The generated template doesn't contain any {otp} placeholder. This means the AI didn't identify an OTP in your SMS.

Suggested solutions:
1. Ensure your SMS contains a clear OTP (numbers or alphanumeric code)
2. Make sure the OTP is not obscured by special characters or formatting
3. Try rephrasing the SMS to highlight the OTP more clearly`;

      } else if (validationResult.reason.includes('Could not extract')) {
        assistantExplanation = `The template was generated but couldn't extract the OTP from your SMS. This might be due to complex formatting or unusual OTP patterns.

Suggested solutions:
1. Simplify the SMS text by removing unnecessary details
2. Ensure the OTP is in a standard format (4-6 digits or alphanumeric)
3. Avoid having the OTP multiple times in the message
4. Contact support with the exact SMS for manual template creation`;

      } else {
        assistantExplanation = `The template generation failed due to: ${validationResult.reason}

General advice:
- Keep SMS messages clear and concise
- Avoid multiple OTP references
- Use standard OTP formats (e.g., 4-6 digits)
- If issues persist, contact support with the exact SMS text for assistance`;
      }

      return NextResponse.json(
        {
          error: `Failed to generate valid template after ${maxAttempts} attempts`,
          details: validationResult.reason,
          assistantExplanation,
          supportContact: "For immediate assistance, please contact support with the exact SMS text."
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      template,
      extractedOtp: validationResult.otp,
      success: true
    });
  } catch (error) {
    console.error('Template generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate template',
        details: error.message,
        assistantExplanation: 'This could be due to OpenAI API issues, invalid SMS format, or internal server errors. Check your API key and try again.'
      },
      { status: 500 }
    );
  }
}
