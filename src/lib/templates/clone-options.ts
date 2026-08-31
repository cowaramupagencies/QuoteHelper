import { v4 as uuidv4 } from "uuid";
import type { QuoteOption } from "@/types";

/** Deep-clone template options with fresh ids so new quotes are independent of the saved template. */
export function cloneTemplateOptions(options: QuoteOption[]): QuoteOption[] {
  return options.map((option, optIdx) => ({
    ...structuredClone(option),
    id: uuidv4(),
    sortOrder: optIdx,
    sections: option.sections.map((section, secIdx) => ({
      ...structuredClone(section),
      id: uuidv4(),
      sortOrder: secIdx,
      items: section.items.map((item) => ({
        ...structuredClone(item),
        id: uuidv4(),
      })),
    })),
  }));
}
