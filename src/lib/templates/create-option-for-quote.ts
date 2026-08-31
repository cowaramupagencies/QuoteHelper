import type { Quote, QuoteOption } from "@/types";
import {
  BLANK_TEMPLATE_ID,
  STEEL_TANK_TEMPLATE_ID,
  createGenericOption,
  createSteelTankOption,
} from "@/lib/templates/steel-tank-install";

/**
 * Creates a new option appropriate to the quote's originating job template.
 * Uses quote.templateId — only built-in steel-tank and blank ids are recognised.
 */
export function createOptionForQuote(
  quote: Pick<Quote, "templateId">,
  name: string,
  sortOrder: number
): QuoteOption {
  if (quote.templateId === STEEL_TANK_TEMPLATE_ID) {
    return createSteelTankOption(name, sortOrder);
  }
  return createGenericOption(name, sortOrder);
}

export { STEEL_TANK_TEMPLATE_ID, BLANK_TEMPLATE_ID };
