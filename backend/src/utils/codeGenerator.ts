import crypto from 'crypto';

/**
 * Backend utility to generate invitation code: SCH-XXXX-YYYY
 */
export function generateInviteCode(): string {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const length = 4;
  
  const getRandomPart = () => {
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  };

  return `SCH-${getRandomPart()}-${getRandomPart()}`;
}