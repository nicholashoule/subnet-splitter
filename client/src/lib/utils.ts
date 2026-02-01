/**
 * client/src/lib/utils.ts
 * 
 * Utility functions for styling and class name manipulation.
 * 
 * Exports:
 * - cn: Merges and deduplicates Tailwind CSS classes using clsx and tailwind-merge
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
