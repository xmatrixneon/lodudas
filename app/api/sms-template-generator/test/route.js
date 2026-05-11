import { NextResponse } from 'next/server';

// Copy regex functions
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

export async function POST(request) {
  try {
    const { template, smsText } = await request.json();

    if (!template || !smsText) {
      return NextResponse.json(
        { error: 'Template and SMS text are required' },
        { status: 400 }
      );
    }

    // Validate template
    const otpCount = (template.match(/{otp}/gi) || []).length;
    if (otpCount === 0) {
      return NextResponse.json({
        success: false,
        error: 'No {otp} placeholder found in template'
      });
    }
    if (otpCount > 1) {
      return NextResponse.json({
        success: false,
        error: 'Multiple {otp} placeholders (use only once)'
      });
    }

    // Build regex
    const regexList = buildSmartOtpRegexList(template);
    if (regexList.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Failed to build regex from template'
      });
    }

    // Test against SMS
    const cleanMessage = normalizeToSingleLine(smsText);
    let otpFound = null;

    for (const regex of regexList) {
      try {
        const match = regex.exec(cleanMessage);
        otpFound = match?.groups?.otp || (match && match[1]) || null;
        if (otpFound) break;
      } catch (error) {
        return NextResponse.json({
          success: false,
          error: `Regex error: ${error.message}`
        });
      }
    }

    if (!otpFound) {
      return NextResponse.json({
        success: false,
        error: 'Could not extract OTP from SMS using this template',
        template,
        smsText,
        regex: regexList[0]?.toString() || 'N/A'
      });
    }

    return NextResponse.json({
      success: true,
      otp: otpFound,
      template,
      smsText,
      regex: regexList[0]?.toString() || 'N/A'
    });

  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json(
      { error: 'Failed to test template', details: error.message },
      { status: 500 }
    );
  }
}
