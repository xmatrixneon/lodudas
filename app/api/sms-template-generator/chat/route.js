import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// Copy functions from main route
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
      pattern = pattern.replace(/\\\{any\\\}/gi, ".*?");
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

function extractSmsFromMessage(message) {
  // Try to extract SMS from message
  const patterns = [
    /generate\s+(?:template|for)[:\s]+"([^"]+)"/i,
    /generate\s+(?:template|for)[:\s]+(.+)$/i,
    /create\s+(?:template|for)[:\s]+"([^"]+)"/i,
    /create\s+(?:template|for)[:\s]+(.+)$/i,
    /template\s+(?:for|from)[:\s]+"([^"]+)"/i,
    /sms[:\s]+"([^"]+)"/i,
    /^"([^"]+)"$/,
    /^(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return message;
}

export async function POST(request) {
  try {
    const { message, history = [] } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const smsText = extractSmsFromMessage(message);

    // Check if user is asking for help/explanation
    if (message.toLowerCase().includes('help') || message.toLowerCase().includes('explain') || message.toLowerCase().includes('placeholder')) {
      const helpResponse = `I can help you create SMS templates! Here's what the placeholders mean:

• {otp} - The verification code (use this once!)
• {random} - Usernames, IDs, names that vary per message
• {time} - Time durations like "100 secs", "5 min"
• {any} - URLs, links, tokens with special characters

Just send me an SMS message like:
"Generate template for: 123456 is your OTP for verification"

I'll create a template that works for any variation of that SMS format!`;

      return NextResponse.json({
        success: true,
        response: helpResponse
      });
    }

    // Validate and extract OTP
    const validateTemplate = (template, smsText) => {
      const otpCount = (template.match(/{otp}/gi) || []).length;
      if (otpCount === 0) {
        return { valid: false, reason: 'No {otp} placeholder found' };
      }
      if (otpCount > 1) {
        return { valid: false, reason: 'Multiple {otp} placeholders (use only once)' };
      }

      const regexList = buildSmartOtpRegexList(template);
      if (regexList.length === 0) {
        return { valid: false, reason: 'Failed to build regex' };
      }

      const cleanMessage = normalizeToSingleLine(smsText);
      let otpFound = null;

      for (const regex of regexList) {
        try {
          const match = regex.exec(cleanMessage);
          otpFound = match?.groups?.otp || (match && match[1]) || null;
          if (otpFound) break;
        } catch (error) {
          return { valid: false, reason: `Regex error: ${error.message}` };
        }
      }

      if (!otpFound) {
        return { valid: false, reason: 'Could not extract OTP from SMS' };
      }

      return { valid: true, otp: otpFound };
    };

    let template;
    let validationResult;
    let attempts = 0;
    const maxAttempts = 3; // Fewer attempts for chat

    // Build conversation history for context
    const conversationHistory = history.slice(-5).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));

    do {
      attempts++;

      const systemPrompt = `You are an SMS template generator assistant. Your job is to:
1. Extract SMS messages from user requests
2. Generate templates that work for ANY variation of the SMS
3. Keep the EXACT same structure (word order, spelling, even typos)
4. Replace ONLY variable parts: OTP codes → {otp}, usernames → {random}, time → {time}, URLs → {any}

Return ONLY the template string, nothing else.`;

      const userPrompt = `Generate a template for this SMS: "${smsText}"

Remember:
- Keep exact structure (typos, grammar, word order)
- Replace OTP code with {otp}
- Replace usernames with {random}
- Replace time durations with {time}
- Replace URLs with {any}

Template:`;

      const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content: userPrompt }
      ];

      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages,
        max_tokens: 500,
        temperature: 0.3,
      });

      template = completion.choices[0]?.message?.content?.trim();

      if (!template) {
        throw new Error('Failed to generate template');
      }

      // Clean template
      template = template.replace(/^```[a-z]*\n?|\n?```$/gi, '')
                        .replace(/^[`'"|\\-]+|[`'"|\\-]+$/g, '')
                        .replace(/^"+|"+$/g, '')
                        .trim();

      validationResult = validateTemplate(template, smsText);

    } while (!validationResult.valid && attempts < maxAttempts);

    if (!validationResult.valid) {
      return NextResponse.json({
        success: true,
        response: `I tried ${maxAttempts} times but couldn't create a working template. The issue was: ${validationResult.reason}

Try rephrasing your request or ask me to fix a specific template. You can also test templates manually in the test panel.`,
        error: validationResult.reason
      });
    }

    return NextResponse.json({
      success: true,
      template,
      extractedOtp: validationResult.otp,
      originalSms: smsText,
      response: `Here's your template:`
    });

  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error.message },
      { status: 500 }
    );
  }
}
