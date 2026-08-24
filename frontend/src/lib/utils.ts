/**
 * Generates an invitation code in the format SCH-XXXX-YYYY
 * Uses unambiguous alphanumeric characters (excluding 0, O, 1, I, L)
 */
export function generateInviteCode(): string {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const length = 4;
  
  const getRandomPart = () => {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
    return result;
  };

  return `SCH-${getRandomPart()}-${getRandomPart()}`;
}