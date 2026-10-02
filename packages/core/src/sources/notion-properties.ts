import { z } from 'zod';
import { plain } from './notion.js';

// A Notion page's properties (developers.notion.com/reference/page-property-values): a database
// row's columns, which an import lists above its content, and its title.

/** One property's value: its `type`, and the value under the key of that name. */
const propertySchema = z.object({ type: z.string() }).passthrough();
export const propertiesSchema = z.record(z.string(), propertySchema);
type Properties = z.infer<typeof propertiesSchema>;

type Value = Record<string, unknown>;
const named = (option: unknown) => (option as Value | null)?.name;
const date = (value: unknown) => {
  const d = value as { start?: string; end?: string | null } | null;
  return d?.start ? (d.end ? `${d.start} to ${d.end}` : d.start) : undefined;
};

/**
 * A property's value (or a formula's result) as one line of text; undefined when it is empty or
 * of a kind not shown (a rollup, a button).
 */
function valueText(property: Value): string | undefined {
  const value = property[String(property.type)];
  switch (property.type) {
    case 'title':
    case 'rich_text':
      return plain(value);
    case 'number':
      return value === null ? undefined : String(value);
    case 'checkbox':
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'select':
    case 'status':
      return named(value) as string | undefined;
    case 'multi_select':
    case 'people':
    case 'files':
      return Array.isArray(value) ? value.map(named).filter(Boolean).join(', ') : undefined;
    case 'date':
      return date(value);
    case 'string':
    case 'url':
    case 'email':
    case 'phone_number':
    case 'created_time':
    case 'last_edited_time':
      return (value as string | null) ?? undefined;
    case 'created_by':
    case 'last_edited_by':
      return named(value) as string | undefined;
    case 'unique_id': {
      const id = value as { prefix?: string | null; number?: number | null } | null;
      return id?.number == null ? undefined : `${id.prefix ? `${id.prefix}-` : ''}${id.number}`;
    }
    case 'formula': {
      const result = value as Value | null;
      if (!result) return undefined;
      return result.type === 'date' ? date(result.date) : valueText(result);
    }
    case 'relation':
      return Array.isArray(value) && value.length
        ? `${value.length} linked page${value.length === 1 ? '' : 's'}`
        : undefined;
    default:
      return undefined;
  }
}

/** The page's title: its one `title` property. */
export const pageTitle = (properties: Properties) =>
  plain(Object.values(properties).find((p) => p.type === 'title')?.title);

/** A database row's properties but its title, `- <name>: <value>` each, the empty ones left out. */
export const propertyLines = (properties: Properties) =>
  Object.entries(properties).flatMap(([name, property]) => {
    if (property.type === 'title') return [];
    const value = valueText(property)?.trim();
    return value ? [`- ${name}: ${value}`] : [];
  });
