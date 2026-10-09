// Shared words (#692): the content words a prompt and a vault source have in common. Per-turn
// relevance offers the model only sources that share enough of them, and its advice names them as
// the reason a note bears on the prompt.

/** Common words of four letters or more that say nothing about what a prompt is about. */
const STOPWORDS = new Set(
  (
    'about above after again also always another back been before being below between both ' +
    'cannot could does doing done down during each either else even ever every from further ' +
    'have having here into just keep know like make many more most much must need never only ' +
    'other over please same should since some still such than that their them then there ' +
    'these they thing things this those through under until upon very want were what when ' +
    'where whether which while will with within without would your yours'
  ).split(' '),
);

/** The content words of `text`: lowercased runs of letters and digits, 4 or more long, no stopword. */
function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  return new Set(words.filter((word) => !STOPWORDS.has(word)));
}

/** The content words of `query` that `text` holds too, in the query's order. */
export function sharedWords(query: string, text: string): string[] {
  const held = contentWords(text);
  return [...contentWords(query)].filter((word) => held.has(word));
}
