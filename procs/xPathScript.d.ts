import type {Page} from 'playwright';

// The in-page script defining window.getXPath, as source text.
export const getXPathSource: string;
// Defines window.getXPath on a live page if it is not already defined.
export function defineGetXPath(page: Page): Promise<void>;
