// Test script for template generator and regex matching
import { config } from "dotenv";
config();

const escapeRegex = (s = "") =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function normalizeToSingleLine(str = "") {
  return str
    .replace(/\r?\n|\r/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Enhanced OTP regex with smarter dot replacement
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
          return "(?<otp>[A-Za-z0-9\\-]{3,20})";
        }
        return "(?:[A-Za-z0-9\\-]{3,20})";
      });

      pattern = pattern.replace(/\\\{date\\\}/gi, ".*");
      pattern = pattern.replace(/\\\{datetime\\\}/gi, ".*");
      pattern = pattern.replace(/\\\{time\\\}/gi, ".*");
      pattern = pattern.replace(/\\\{duration\\\}/gi, ".*");
      pattern = pattern.replace(/\\\{random\\\}/gi, "[A-Za-z0-9]{3,20}");
      pattern = pattern.replace(/\\\{url\\\}/gi, "\\S+");
      pattern = pattern.replace(/\\\{link\\\}/gi, "\\S+");
      pattern = pattern.replace(/\\\{phone\\\}/gi, "[+]?[0-9\\-]{8,15}");
      pattern = pattern.replace(/\\\{email\\\}/gi, "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}");
      pattern = pattern.replace(/\\\{id\\\}/gi, "[A-Za-z0-9\\-]{5,30}");
      pattern = pattern.replace(/\\\{name\\\}/gi, "[A-Za-z\\s]{2,30}");
      pattern = pattern.replace(/\\\{amount\\\}/gi, "[$€£₹₽]?[0-9.,]+[A-Z]*(?:\\s?(?:USD|EUR|GBP|INR|Rs)?)?");
      pattern = pattern.replace(/\\\{digits\\\}/gi, "\\d{3,15}");
      pattern = pattern.replace(/\\\{number\\\}/gi, "\\d+");
      pattern = pattern.replace(/\\\{any\\\}/gi, ".*");
      pattern = pattern.replace(/\\\{.*?\\\}/gi, ".*");

      pattern = pattern
        .replace(/\\s+/g, "\\s*")
        .replace(/\\:/g, "[:：]?");

      // ✅ Smarter dot replacement
      pattern = pattern
        .replace(/\\\.$/g, ".*")
        .replace(/\\\.\s+(?=[A-Z])|\\\.\s*$|\\\.\s*-----/g, "\\.\\s*")
        .replace(/\\\./g, "\\.");

      return new RegExp(pattern, "i");
    })
    .filter(Boolean);
}

// Test cases
console.log("=== Testing Template Generator & Regex Matching ===\n");

const tests = [
  {
    name: "ORGEN format (new)",
    template: "{otp} is your OTP for login/signup. Valid for {time}. Do not share. {any}",
    sms: "471154 is your OTP for login/signup. Valid for 5 mins. Do not share. -----ORGEN",
    expected: "471154"
  },
  {
    name: "Airtel format (old)",
    template: "<#> {otp} is your OTP to login into Airtel Thanks app. Valid for {time}. Do not share with anyone. If this was not you click {url} {any}",
    sms: "<#> 1770 is your OTP to login into Airtel Thanks app. Valid for 100 secs. Do not share with anyone. If this was not you click i.airtel.in/Contact N9BWuqauU1y",
    expected: "1770"
  },
  {
    name: "Simple OTP (old)",
    template: "Your verification code is {otp}. Valid for {time}.",
    sms: "Your verification code is 123456. Valid for 10 minutes.",
    expected: "123456"
  },
  {
    name: "Vi format (old)",
    template: "Dear customer, {otp} is the one Time Password from Vi. Expires in {time}. OTP @{url} #{any}",
    sms: "Dear customer, 5672 is the one Time Password from Vi. Expires in 3 min. OTP @www.myvi.in #5672",
    expected: "5672"
  },
  {
    name: "MyJio format (old)",
    template: "{otp} is your One time password (OTP) to login to MyJio. Don't share OTP with anyone. Please enter the OTP to proceed.",
    sms: "341722 is your One time password (OTP) to login to MyJio. Don't share OTP with anyone. Please enter the OTP to proceed.",
    expected: "341722"
  },
  {
    name: "URL with dots (old)",
    template: "Verify your account: {otp} is your code. Visit {url} if you didn't request this.",
    sms: "Verify your account: 456789 is your code. Visit https://example.com/verify if you didn't request this.",
    expected: "456789"
  }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  console.log(`\n📋 Test: ${test.name}`);
  console.log(`   Template: ${test.template}`);
  console.log(`   SMS: ${test.sms.substring(0, 80)}...`);

  const regexList = buildSmartOtpRegexList(test.template);
  const cleanMessage = normalizeToSingleLine(test.sms);

  let otpFound = null;
  for (const regex of regexList) {
    const match = regex.exec(cleanMessage);
    otpFound = match?.groups?.otp || (match && match[1]) || null;
    if (otpFound) break;
  }

  if (otpFound === test.expected) {
    console.log(`   ✅ PASS - Extracted: "${otpFound}"`);
    passed++;
  } else {
    console.log(`   ❌ FAIL - Expected: "${test.expected}", Got: "${otpFound}"`);
    failed++;
  }
}

console.log(`\n\n=== Summary ===`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📊 Success Rate: ${((passed / tests.length) * 100).toFixed(1)}%`);

// Show the generated regex for ORGEN format
console.log(`\n\n=== Generated Regex for ORGEN format ===`);
const orgenRegex = buildSmartOtpRegexList("{otp} is your OTP for login/signup. Valid for {time}. Do not share. {any}")[0];
console.log(`Regex: ${orgenRegex}`);
console.log(`\nTest against: "471154 is your OTP for login/signup. Valid for 5 mins. Do not share. -----ORGEN"`);
const match = orgenRegex.exec(normalizeToSingleLine("471154 is your OTP for login/signup. Valid for 5 mins. Do not share. -----ORGEN"));
console.log(`Match result:`, match ? { otp: match.groups?.otp, fullMatch: match[0] } : "No match");
