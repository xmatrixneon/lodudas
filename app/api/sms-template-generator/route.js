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
You are an expert SMS template generator. Your template must work for ANY variation of the same SMS format.

=== CRITICAL RULE ===
Ask yourself: "If this SMS comes again with different values (different OTP, different username, different time), will my template still work?"
- If YES → Good template
- If NO → Replace the variable part with a placeholder

=== PLACEHOLDER GUIDE ===

{otp}     → OTP/Verification code ONLY (use exactly once!)
{random}  → Usernames, IDs, names, alphanumeric strings that vary
{time}    → Time durations (5 min, 100 secs, 2 hours, 30 minutes)
{date}    → Dates (2024-01-15, Jan 15, 15/01/2024)
{any}     → URLs, links, tokens with special chars (/, +, -, #, @)

=== WHAT TO REPLACE (VARIES PER MESSAGE) ===

✅ MUST Replace:
- OTP codes: "668523", "1770", "791648", "ABC-123" → {otp}
- Usernames: "Renu_1982Mishra", "JohnDoe123" → {random}
- IDs: "ID: ABC123", "Ref: XYZ789" → "ID: {random}", "Ref: {random}"
- Customer names: "Dear Amit", "Hello Priya" → "Dear {random}"
- Time: "100 secs", "5 min", "2 hours" → {time}
- Dates: "2024-01-15", "today" → {date}
- URLs: "bit.ly/abc", "wa.me/123" → {any}
- Tokens: "N9BWuqauU1y", "#abc123" → {random} or {any}

❌ DO NOT Replace (static text):
- Words: "OTP", "password", "code", "verification", "login", "authenticate"
- Company names: "IRCTC", "Airtel", "Jio", "Vi", "Paytm"
- App names: "Twitter", "Facebook", "WhatsApp"
- Static phrases: "DO NOT disclose", "Valid for", "Expires in", "is your"

=== REAL EXAMPLES ===

Example 1 - IRCTC (username varies):
SMS: "668523 is OTP for Mobile number verification of User Renu_1982Mishra. DO NOT disclose it to anyone -IRCTC"
Template: "{otp} is OTP for Mobile number verification of User {random}. DO NOT disclose it to anyone -IRCTC"
Why: Username "Renu_1982Mishra" varies → {random}, "IRCTC" is static → keep

Example 2 - Airtel (time varies):
SMS: "<#> 1770 is your OTP to login into Airtel Thanks app. Valid for 100 secs. Do not share with anyone."
Template: "<#> {otp} is your OTP to login into Airtel Thanks app. Valid for {time}. Do not share with anyone."
Why: "1770" → {otp}, "100 secs" varies → {time}, "Airtel" static → keep

Example 3 - Jio (simple):
SMS: "791648 is your One time password (OTP) to login to MyJio. Do not share OTP with anyone."
Template: "{otp} is your One time password (OTP) to login to MyJio. Do not share OTP with anyone."
Why: Only OTP varies, everything else static

Example 4 - With URL and token:
SMS: "123456 is your code. Click bit.ly/xyz?token=abc123 to verify"
Template: "{otp} is your code. Click {any} to verify"
Why: URL varies → {any}

Example 5 - Paytm (merchant name varies):
SMS: "Your OTP for login to Paytm is 884721. Valid for Merchant: AmazonPay"
Template: "Your OTP for login to Paytm is {otp}. Valid for Merchant: {random}"
Why: Merchant name varies → {random}

Example 6 - WhatsApp (device name varies):
SMS: "Your WhatsApp code is 789-012. Don't share this code with anyone. Device: iPhone 12 Pro"
Template: "Your WhatsApp code is {otp}. Don't share this code with anyone. Device: {random}"
Why: Device name varies → {random}

Example 7 - Multiple variables:
SMS: "Dear Customer, use 456789 as verification code for ICICI Bank ending 4589. Valid for 3 min. Ref: ABC123XYZ"
Template: "Dear Customer, use {otp} as verification code for ICICI Bank ending {random}. Valid for {time}. Ref: {random}"
Why: OTP, card ending, time, reference all vary

${validationResult && !validationResult.valid ? `
=== PREVIOUS ATTEMPT FAILED ===
Error: ${validationResult.reason}

${validationResult.reason.includes('No {otp}') ? '🔴 You forgot to replace the OTP code with {otp}' : ''}
${validationResult.reason.includes('multiple') ? '🔴 You used {otp} multiple times. Use it only for the first OTP' : ''}
${validationResult.reason.includes('Could not extract') ? '🔴 Template does not match. You probably kept a variable value that should be {random}' : ''}

Think: What varies between messages? Replace ALL varying parts with placeholders.
` : ''}

=== YOUR TASK ===
SMS: "${smsText}"

Generate template that will work for ANY variation of this SMS:
`;


      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: "You are an SMS template generator. Create templates that work for ANY variation of the SMS format. Replace: OTP codes → {otp} (once only), usernames/IDs/names → {random}, time durations → {time}, dates → {date}, URLs → {any}. Keep company names, app names, and words like OTP/password unchanged. Return ONLY the template string."
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
