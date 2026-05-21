'use server'

export async function validatePin(pin: string): Promise<boolean> {
  return pin === process.env.ADMIN_PIN
}
