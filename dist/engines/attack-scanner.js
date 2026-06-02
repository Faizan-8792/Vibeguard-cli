import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashString } from '../utils/hash-utils.js';
const DETECTORS = [
    // ─── DDoS / Rate Limiting ──────────────────────────────────────────────
    {
        attackType: 'DDoS / Resource Exhaustion',
        detectorCode: '101',
        category: 'availability',
        severity: 'high',
        regex: /\b(?:app|router|server)\.(?:get|post|put|delete|use|all)\s*\(/,
        mitigatedBy: /rate[\s-]?limit|express-rate-limit|rateLimit|slowDown|throttle/i,
        message: 'HTTP route handlers without rate limiting — vulnerable to DDoS/flooding',
        recommendation: 'Add rate limiting middleware (e.g. express-rate-limit) to throttle requests per IP',
    },
    // ─── Brute Force / OTP / Login ─────────────────────────────────────────
    {
        attackType: 'Brute Force / Credential Stuffing',
        detectorCode: '102',
        category: 'authentication',
        severity: 'high',
        regex: /\b(?:login|signin|authenticate|verifyOtp|verify_otp|checkPassword|comparePassword)\b/i,
        mitigatedBy: /rate[\s-]?limit|attempts|lockout|maxAttempts|backoff|captcha/i,
        message: 'Authentication endpoint without brute-force protection (no attempt limiting/lockout)',
        recommendation: 'Add login attempt limiting, account lockout, exponential backoff, or CAPTCHA',
    },
    {
        attackType: 'OTP Abuse / Flooding',
        detectorCode: '103',
        category: 'authentication',
        severity: 'high',
        regex: /\b(?:sendOtp|send_otp|sendOTP|generateOtp|sendVerificationCode|sendSms|sendSMS)\b/,
        mitigatedBy: /rate[\s-]?limit|cooldown|resend.*(?:delay|interval|timeout)|attempts/i,
        message: 'OTP/verification-code sender without rate limiting — vulnerable to OTP flooding/SMS bombing',
        recommendation: 'Add per-user/per-phone cooldown and daily send limits for OTP generation',
    },
    // ─── SQL Injection ─────────────────────────────────────────────────────
    {
        attackType: 'SQL Injection',
        detectorCode: '104',
        category: 'injection',
        severity: 'critical',
        regex: /(?:query|execute|raw)\s*\(\s*[`'"][^`'"]*(?:SELECT|INSERT|UPDATE|DELETE|DROP)[^`'"]*\$\{/i,
        message: 'SQL query built with string interpolation — SQL injection risk',
        recommendation: 'Use parameterized queries / prepared statements instead of string interpolation',
    },
    {
        attackType: 'SQL Injection',
        detectorCode: '105',
        category: 'injection',
        severity: 'critical',
        regex: /(?:query|execute)\s*\(\s*[`'"][^`'"]*(?:SELECT|INSERT|UPDATE|DELETE)[^`'"]*[`'"]\s*\+/i,
        message: 'SQL query concatenated with user input — SQL injection risk',
        recommendation: 'Use parameterized queries with placeholders ($1, ?) and bound values',
    },
    // ─── NoSQL Injection ───────────────────────────────────────────────────
    {
        attackType: 'NoSQL Injection',
        detectorCode: '106',
        category: 'injection',
        severity: 'high',
        regex: /\.(?:find|findOne|updateOne|deleteOne)\s*\(\s*\{\s*\$where/,
        message: 'MongoDB $where operator with potential user input — NoSQL injection risk',
        recommendation: 'Avoid $where with user input; use typed query operators and validate input',
    },
    // ─── XSS ───────────────────────────────────────────────────────────────
    {
        attackType: 'Cross-Site Scripting (XSS)',
        detectorCode: '107',
        category: 'injection',
        severity: 'high',
        regex: /\.innerHTML\s*=|dangerouslySetInnerHTML|document\.write\s*\(/,
        mitigatedBy: /DOMPurify|sanitize|escapeHtml|xss\(/i,
        message: 'Direct HTML injection without sanitization — XSS risk',
        recommendation: 'Sanitize with DOMPurify or use safe text APIs (textContent) instead of innerHTML',
    },
    // ─── Command Injection ─────────────────────────────────────────────────
    {
        attackType: 'Command Injection',
        detectorCode: '108',
        category: 'injection',
        severity: 'critical',
        regex: /\b(?:exec|execSync|spawn|spawnSync)\s*\(\s*[`'"][^`'"]*\$\{/,
        message: 'Shell command built with interpolated input — command injection risk',
        recommendation: 'Use execFile with an args array, never interpolate user input into shell strings',
    },
    // ─── Path Traversal ────────────────────────────────────────────────────
    {
        attackType: 'Path Traversal',
        detectorCode: '109',
        category: 'access-control',
        severity: 'high',
        regex: /(?:readFile|readFileSync|createReadStream|sendFile)\s*\([^)]*(?:req\.(?:params|query|body)|request\.)/,
        mitigatedBy: /path\.normalize|path\.resolve.*startsWith|sanitizePath/i,
        message: 'File path derived from user input without normalization — path traversal risk',
        recommendation: 'Normalize and validate paths; ensure resolved path stays within an allowed directory',
    },
    // ─── SSRF ──────────────────────────────────────────────────────────────
    {
        attackType: 'Server-Side Request Forgery (SSRF)',
        detectorCode: '110',
        category: 'access-control',
        severity: 'high',
        regex: /(?:fetch|axios\.(?:get|post)|http\.get|request)\s*\(\s*(?:req\.(?:params|query|body)|request\.)/,
        mitigatedBy: /allowlist|allowList|whitelist|isAllowedUrl|validateUrl/i,
        message: 'Outbound request to a user-controlled URL — SSRF risk',
        recommendation: 'Validate target URLs against an allowlist; block internal/metadata IP ranges',
    },
    // ─── CSRF ──────────────────────────────────────────────────────────────
    {
        attackType: 'Cross-Site Request Forgery (CSRF)',
        detectorCode: '111',
        category: 'authentication',
        severity: 'medium',
        regex: /\b(?:app|router)\.(?:post|put|delete)\s*\(/,
        mitigatedBy: /csrf|csurf|sameSite|x-csrf-token|csrfToken/i,
        message: 'State-changing routes without visible CSRF protection',
        recommendation: 'Use CSRF tokens or SameSite=strict cookies for state-changing requests',
    },
    // ─── Weak Crypto ───────────────────────────────────────────────────────
    {
        attackType: 'Weak Cryptography',
        detectorCode: '112',
        category: 'cryptography',
        severity: 'high',
        regex: /createHash\s*\(\s*['"](?:md5|sha1)['"]\)|crypto\.createCipher\s*\(/,
        message: 'Weak/broken hashing or deprecated cipher (MD5/SHA1/createCipher)',
        recommendation: 'Use SHA-256+ for hashing and createCipheriv with a random IV for encryption',
    },
    {
        attackType: 'Weak Password Hashing',
        detectorCode: '113',
        category: 'cryptography',
        severity: 'high',
        regex: /password.*createHash|createHash.*password/i,
        mitigatedBy: /bcrypt|argon2|scrypt|pbkdf2/i,
        message: 'Password hashed with a fast hash instead of a password-hashing function',
        recommendation: 'Use bcrypt, argon2, or scrypt for password hashing',
    },
    // ─── Insecure Randomness ───────────────────────────────────────────────
    {
        attackType: 'Insecure Randomness',
        detectorCode: '114',
        category: 'cryptography',
        severity: 'medium',
        regex: /Math\.random\s*\(\s*\)/,
        mitigatedBy: /crypto\.(?:randomBytes|randomUUID|randomInt)/,
        message: 'Math.random() used — not cryptographically secure for tokens/secrets',
        recommendation: 'Use crypto.randomBytes / crypto.randomUUID for security-sensitive randomness',
    },
    // ─── Open Redirect ─────────────────────────────────────────────────────
    {
        attackType: 'Open Redirect',
        detectorCode: '115',
        category: 'access-control',
        severity: 'medium',
        regex: /res\.redirect\s*\(\s*(?:req\.(?:query|params|body)|request\.)/,
        message: 'Redirect target taken directly from user input — open redirect risk',
        recommendation: 'Validate redirect targets against an allowlist of internal paths',
    },
    // ─── Missing Security Headers ──────────────────────────────────────────
    {
        attackType: 'Missing Security Headers',
        detectorCode: '116',
        category: 'hardening',
        severity: 'low',
        regex: /express\s*\(\s*\)|createServer\s*\(/,
        mitigatedBy: /helmet|Content-Security-Policy|X-Frame-Options|hsts/i,
        message: 'Server without security headers middleware (helmet/CSP)',
        recommendation: 'Add helmet() middleware to set CSP, HSTS, X-Frame-Options and other headers',
    },
    // ─── Prototype Pollution ───────────────────────────────────────────────
    {
        attackType: 'Prototype Pollution',
        detectorCode: '117',
        category: 'injection',
        severity: 'medium',
        regex: /(?:Object\.assign|_\.merge|deepMerge|extend)\s*\([^)]*(?:req\.body|JSON\.parse)/,
        message: 'Deep merge/assign of untrusted object — prototype pollution risk',
        recommendation: 'Reject __proto__/constructor keys or use a pollution-safe merge utility',
    },
    // ─── Eval / Dynamic Code ───────────────────────────────────────────────
    {
        attackType: 'Arbitrary Code Execution',
        detectorCode: '118',
        category: 'injection',
        severity: 'critical',
        regex: /\beval\s*\(|new\s+Function\s*\(/,
        message: 'Dynamic code execution (eval / new Function) — RCE risk if input is untrusted',
        recommendation: 'Avoid eval/new Function; use safe parsers (JSON.parse) or explicit logic',
    },
    // ─── Mass Assignment ───────────────────────────────────────────────────
    {
        attackType: 'Mass Assignment',
        detectorCode: '119',
        category: 'access-control',
        severity: 'medium',
        regex: /\b(?:create|update|save)\s*\(\s*req\.body\s*\)/,
        message: 'Model created/updated directly from req.body — mass assignment risk',
        recommendation: 'Whitelist allowed fields explicitly instead of passing req.body directly',
    },
];
const COVERAGE = [
    'DDoS / Resource Exhaustion',
    'Brute Force / Credential Stuffing',
    'OTP Abuse / SMS Bombing',
    'SQL Injection',
    'NoSQL Injection',
    'Cross-Site Scripting (XSS)',
    'Command Injection',
    'Path Traversal',
    'Server-Side Request Forgery (SSRF)',
    'Cross-Site Request Forgery (CSRF)',
    'Weak Cryptography',
    'Weak Password Hashing',
    'Insecure Randomness',
    'Open Redirect',
    'Missing Security Headers',
    'Prototype Pollution',
    'Arbitrary Code Execution (eval)',
    'Mass Assignment',
];
export async function scanAttacks(projectRoot, files, _config) {
    const findings = [];
    for (const file of files) {
        if (file.match(/\.(test|spec)\./))
            continue;
        let content;
        try {
            content = await readFile(resolve(projectRoot, file), 'utf-8');
        }
        catch {
            continue;
        }
        const lines = content.split('\n');
        for (const detector of DETECTORS) {
            // If a mitigation pattern is present anywhere in the file, skip this detector for the file
            if (detector.mitigatedBy && detector.mitigatedBy.test(content)) {
                continue;
            }
            const regex = new RegExp(detector.regex.source, detector.regex.flags.includes('g') ? detector.regex.flags : detector.regex.flags + 'g');
            let match;
            let perFileCount = 0;
            while ((match = regex.exec(content)) !== null) {
                const lineNumber = content.substring(0, match.index).split('\n').length;
                const lineContent = lines[lineNumber - 1] ?? '';
                const contentHash = hashString(`${file}:${detector.detectorCode}:${lineNumber}`).substring(0, 8);
                findings.push({
                    id: `ATK-${detector.detectorCode}-${contentHash}`,
                    category: detector.category,
                    attackType: detector.attackType,
                    severity: detector.severity,
                    message: detector.message,
                    file,
                    line: lineNumber,
                    snippet: lineContent.trim().substring(0, 120),
                    recommendation: detector.recommendation,
                });
                perFileCount++;
                if (perFileCount >= 5)
                    break; // Cap findings per detector per file to reduce noise
                if (!regex.global)
                    break;
            }
        }
    }
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings)
        counts[f.severity]++;
    return { findings, counts, coverage: COVERAGE };
}
//# sourceMappingURL=attack-scanner.js.map