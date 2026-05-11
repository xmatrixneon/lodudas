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
    const { smsText, template: manualTemplate } = await request.json();

    if (!smsText) {
      return NextResponse.json({ error: 'SMS text is required' }, { status: 400 });
    }

    // MANUAL FIX MODE: User provided their own template to validate
    if (manualTemplate) {
      console.log(`[Template Gen] MANUAL FIX MODE: Validating user template = "${manualTemplate}"`);

      const validateTemplate = (template, smsText) => {
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
          return { valid: false, reason: 'Could not extract OTP from SMS using the template' };
        }

        return { valid: true, otp: otpFound };
      };

      const validationResult = validateTemplate(manualTemplate, smsText);

      if (validationResult.valid) {
        const regexList = buildSmartOtpRegexList(manualTemplate);
        return NextResponse.json({
          template: manualTemplate,
          extractedOtp: validationResult.otp,
          success: true,
          mode: 'manual_fix',
          regex: regexList[0]?.toString() || 'N/A'
        });
      } else {
        return NextResponse.json(
          {
            error: 'Manual template validation failed',
            details: validationResult.reason,
            yourTemplate: manualTemplate,
            originalSms: smsText
          },
          { status: 400 }
        );
      }
    }

    // AI GENERATION MODE: Generate template using AI

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
You are an SMS template generator. Replace variable parts with placeholders while keeping the exact same structure.

=== TWO RULES TO FOLLOW ===

1. KEEP EXACT STRUCTURE:
   - Same word order
   - Same spelling (even typos like "idaentity")
   - Same grammar (even wrong like "for verify")
   - Same punctuation

2. REPLACE VARIABLE PARTS:
   - OTP codes → {otp} (MANDATORY, use once)
   - Usernames/IDs/Names → {random} (if they vary per user)
   - Time durations → {time} (100 secs, 5 min, etc.)
   - URLs/Links → {any} (bit.ly, etc.)

=== EXAMPLES ===

Example 1 - CYBER LINK (keep typos!):
SMS: "OTP for login in your CYBER LINK account is 9980. Please enter this for verify your idaentity. -CYBER LINK"
Template: "OTP for login in your CYBER LINK account is {otp}. Please enter this for verify your idaentity. -CYBER LINK"
Note: "idaentity" typo kept, "for verify" kept, only "9980" → {otp}

Example 2 - IRCTC (username varies):
SMS: "668523 is OTP for Mobile number verification of User Renu_1982Mishra. DO NOT disclose it to anyone -IRCTC"
Template: "{otp} is OTP for Mobile number verification of User {random}. DO NOT disclose it to anyone -IRCTC"
Note: "668523" → {otp}, "Renu_1982Mishra" → {random} (varies per user)

Example 3 - Airtel (time varies):
SMS: "<#> 1770 is your OTP to login into Airtel Thanks app. Valid for 100 secs. Do not share with anyone."
Template: "<#> {otp} is your OTP to login into Airtel Thanks app. Valid for {time}. Do not share with anyone."
Note: "1770" → {otp}, "100 secs" → {time}

Example 4 - Simple:
SMS: "123456 is your OTP"
Template: "{otp} is your OTP"

${validationResult && !validationResult.valid ? `
=== PREVIOUS ATTEMPT FAILED ===
Error: ${validationResult.reason}

${validationResult.reason.includes('No {otp}') ? '🔴 You forgot to use {otp}. You must replace the OTP number with {otp}' : ''}
${validationResult.reason.includes('multiple') ? '🔴 You used {otp} multiple times. Use it only ONCE' : ''}
${validationResult.reason.includes('Could not extract') ? `🔴 REGEX MISMATCH - Your template structure does NOT match the SMS!
Check these:
- Did you change word order? Keep the SAME order!
- Did you fix typos? Keep typos as-is!
- Did you fix grammar? Keep grammar as-is!
- Your template must match the SMS EXACTLY except for {otp}, {random}, {time}, {any}

Original: "${smsText}"
Your attempt must have the exact same structure!` : ''}

Remember: Find the OTP number, replace with {otp}, keep EVERYTHING else exactly the same!
` : ''}

=== YOUR TASK ===
SMS: "${smsText}"

Template (keep exact structure, only replace OTP code with {otp}):
`;


      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are an SMS template generator. Replace: OTP codes → {otp} (once), usernames/IDs → {random}, time durations → {time}, URLs → {any}. Keep exact word order, spelling, and even typos. Return ONLY the template."
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
      // MANUAL FIX MODE: Return the last attempted template with detailed info
      const regexList = buildSmartOtpRegexList(template);
      const generatedRegex = regexList.length > 0 ? regexList[0].toString() : 'Failed to build';

      return NextResponse.json(
        {
          error: `Failed to generate valid template after ${maxAttempts} attempts`,
          details: validationResult.reason,
          lastAttempt: template,
          generatedRegex: generatedRegex,
          originalSms: smsText,
          canRetry: true,
          manualFixInstructions: {
            step1: "Review the 'lastAttempt' template above",
            step2: "Edit the template to fix the issue",
            step3: "POST again with 'template' parameter set to your fixed version",
            step4: "Example: {\"smsText\": \"...\", \"template\": \"your fixed template\"}"
          },
          commonFixes: {
            multipleOtp: "Remove extra {otp} - keep only the first occurrence",
            noOtp: "Add {otp} where the OTP code appears in the SMS",
            extractionFailed: "Ensure template structure matches SMS exactly (spaces, punctuation)"
          }
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
