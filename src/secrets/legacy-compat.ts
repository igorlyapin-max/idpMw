export function applyPamCompatibility(): void {
  const updates: Record<string, string> = {};

  const setIfPresent = (envName: string, targetPath: string) => {
    const value = process.env[envName];
    if (value?.trim() && !process.env[targetPath]) {
      updates[targetPath] = value.trim();
    }
  };

  setIfPresent('PAMURL', 'SECRETS_INDEEDPAMAAPM_BASEURL');
  setIfPresent('PAMUSERNAME', 'SECRETS_INDEEDPAMAAPM_APPLICATIONUSERNAME');
  setIfPresent('PAMPASSWORD', 'SECRETS_INDEEDPAMAAPM_APPLICATIONPASSWORD');
  setIfPresent('PAMTOKEN', 'SECRETS_INDEEDPAMAAPM_APPLICATIONTOKEN');
  setIfPresent(
    'PAMDEFAULTACCOUNTPATH',
    'SECRETS_INDEEDPAMAAPM_DEFAULTACCOUNTPATH',
  );

  const hasPamCompatibility =
    !!process.env['PAMURL']?.trim() ||
    !!process.env['PAMTOKEN']?.trim() ||
    (!!process.env['PAMUSERNAME']?.trim() &&
      !!process.env['PAMPASSWORD']?.trim());

  if (hasPamCompatibility && !process.env['SECRETS_PROVIDER']) {
    updates['SECRETS_PROVIDER'] = 'IndeedPamAapm';
  }

  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}
