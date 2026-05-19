/** Payloads courants pour tests XSS (réutilisables entre suites). */
export const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  "<img src=x onerror=alert(1)>",
  "javascript:alert(1)",
  '</title><script>alert(1)</script>',
  '\'" onmouseover=alert(1) x="',
  '<svg/onload=alert(1)>',
];
