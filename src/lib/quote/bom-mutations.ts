import { v4 as uuidv4 } from "uuid";
import { calculateItemPricing, duplicateOption } from "@/lib/pricing/calculations";
import { createSection } from "@/lib/templates/steel-tank-install";
import { createOptionForQuote } from "@/lib/templates/create-option-for-quote";
import type { BomItem, BomSection, Quote, QuoteOption } from "@/types";

export type BomRowView =
  | { type: "option-header"; optionId: string }
  | { type: "section-header"; optionId: string; sectionId: string }
  | { type: "item"; optionId: string; sectionId: string; itemId: string }
  | { type: "section-add-actions"; optionId: string; sectionId: string }
  | { type: "section-total"; optionId: string; sectionId: string };

export function buildBomRowViews(quote: Quote): BomRowView[] {
  const rows: BomRowView[] = [];
  for (const option of [...quote.options].sort((a, b) => a.sortOrder - b.sortOrder)) {
    rows.push({ type: "option-header", optionId: option.id });
    for (const section of [...option.sections].sort((a, b) => a.sortOrder - b.sortOrder)) {
      rows.push({ type: "section-header", optionId: option.id, sectionId: section.id });
      for (const item of section.items) {
        rows.push({
          type: "item",
          optionId: option.id,
          sectionId: section.id,
          itemId: item.id,
        });
      }
      rows.push({ type: "section-add-actions", optionId: option.id, sectionId: section.id });
      if (section.items.length > 0) {
        rows.push({ type: "section-total", optionId: option.id, sectionId: section.id });
      }
    }
  }
  return rows;
}

export function findOption(quote: Quote, optionId: string): QuoteOption | undefined {
  return quote.options.find((o) => o.id === optionId);
}

export function findSection(option: QuoteOption, sectionId: string): BomSection | undefined {
  return option.sections.find((s) => s.id === sectionId);
}

export function findItem(section: BomSection, itemId: string): BomItem | undefined {
  return section.items.find((i) => i.id === itemId);
}

export function getDefaultTarget(quote: Quote): { optionId: string; sectionId: string } | null {
  const option = [...quote.options].sort((a, b) => b.sortOrder - a.sortOrder)[0];
  if (!option) return null;
  const section = [...option.sections].sort((a, b) => b.sortOrder - a.sortOrder)[0];
  if (!section) return null;
  return { optionId: option.id, sectionId: section.id };
}

export function updateQuoteOptions(quote: Quote, options: QuoteOption[]): Quote {
  return { ...quote, options };
}

export function mapOptions(quote: Quote, mapper: (options: QuoteOption[]) => QuoteOption[]): Quote {
  return updateQuoteOptions(quote, mapper(quote.options));
}

export function addOption(quote: Quote, name?: string): Quote {
  const n = quote.options.length + 1;
  return updateQuoteOptions(quote, [
    ...quote.options,
    createOptionForQuote(quote, name ?? `Option ${n}`, quote.options.length),
  ]);
}

export function addSection(quote: Quote, optionId: string, name?: string): Quote {
  return mapOptions(quote, (options) =>
    options.map((option) => {
      if (option.id !== optionId) return option;
      const label = name ?? `Section ${option.sections.length + 1}`;
      return {
        ...option,
        sections: [
          ...option.sections,
          createSection(label, option.sections.length, { customerLabel: label }),
        ],
      };
    })
  );
}

export function addItem(
  quote: Quote,
  optionId: string,
  sectionId: string,
  item: BomItem
): Quote {
  return mapOptions(quote, (options) =>
    options.map((option) => {
      if (option.id !== optionId) return option;
      return {
        ...option,
        sections: option.sections.map((section) =>
          section.id === sectionId
            ? { ...section, items: [...section.items, calculateItemPricing(item)] }
            : section
        ),
      };
    })
  );
}

export function updateItem(
  quote: Quote,
  optionId: string,
  sectionId: string,
  itemId: string,
  patch: Partial<BomItem>
): Quote {
  return mapOptions(quote, (options) =>
    options.map((option) => {
      if (option.id !== optionId) return option;
      return {
        ...option,
        sections: option.sections.map((section) => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            items: section.items.map((item) =>
              item.id === itemId ? calculateItemPricing({ ...item, ...patch }) : item
            ),
          };
        }),
      };
    })
  );
}

export function removeItem(
  quote: Quote,
  optionId: string,
  sectionId: string,
  itemId: string
): Quote {
  return mapOptions(quote, (options) =>
    options.map((option) => {
      if (option.id !== optionId) return option;
      return {
        ...option,
        sections: option.sections.map((section) =>
          section.id === sectionId
            ? { ...section, items: section.items.filter((i) => i.id !== itemId) }
            : section
        ),
      };
    })
  );
}

export function updateSection(
  quote: Quote,
  optionId: string,
  sectionId: string,
  patch: Partial<BomSection>
): Quote {
  return mapOptions(quote, (options) =>
    options.map((option) => {
      if (option.id !== optionId) return option;
      return {
        ...option,
        sections: option.sections.map((section) =>
          section.id === sectionId ? { ...section, ...patch } : section
        ),
      };
    })
  );
}

export function updateOption(quote: Quote, optionId: string, patch: Partial<QuoteOption>): Quote {
  return mapOptions(quote, (options) =>
    options.map((option) => (option.id === optionId ? { ...option, ...patch } : option))
  );
}

export function removeSection(quote: Quote, optionId: string, sectionId: string): Quote {
  return mapOptions(quote, (options) =>
    options.map((option) => {
      if (option.id !== optionId) return option;
      return {
        ...option,
        sections: option.sections.filter((s) => s.id !== sectionId),
      };
    })
  );
}

export function removeOption(quote: Quote, optionId: string): Quote {
  if (quote.options.length <= 1) return quote;
  return updateQuoteOptions(
    quote,
    quote.options.filter((o) => o.id !== optionId).map((o, idx) => ({ ...o, sortOrder: idx }))
  );
}

export function duplicateOptionInQuote(quote: Quote, optionId: string): Quote {
  const source = findOption(quote, optionId);
  if (!source) return quote;
  const copy = duplicateOption(source, `${source.name} (copy)`);
  copy.sortOrder = quote.options.length;
  return updateQuoteOptions(quote, [...quote.options, copy]);
}

export function duplicateSectionInQuote(
  quote: Quote,
  optionId: string,
  sectionId: string
): Quote {
  return mapOptions(quote, (options) =>
    options.map((option) => {
      if (option.id !== optionId) return option;
      const source = findSection(option, sectionId);
      if (!source) return option;
      const clone: BomSection = {
        ...structuredClone(source),
        id: uuidv4(),
        name: `${source.name} (copy)`,
        sortOrder: option.sections.length,
        items: source.items.map((item) => ({
          ...structuredClone(item),
          id: uuidv4(),
        })),
      };
      return { ...option, sections: [...option.sections, clone] };
    })
  );
}
