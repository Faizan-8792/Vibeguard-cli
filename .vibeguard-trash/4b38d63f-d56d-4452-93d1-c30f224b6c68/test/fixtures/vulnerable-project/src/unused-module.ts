// This entire file is dead code - never imported by anything

export function deadFunction1() {
  return 'I am never called';
}

export function deadFunction2() {
  return 'I am also never called';
}

export class DeadClass {
  method() {
    return 'unreachable';
  }
}

export const DEAD_CONSTANT = 'this value is never used';
