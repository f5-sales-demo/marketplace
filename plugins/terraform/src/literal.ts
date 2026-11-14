/** Replacement callbacks preserve both dollar signs; replacement strings interpret $$ specially. */
export const terraformLiteral = (value: string) => value.replaceAll('${', () => '$${').replaceAll('%{', () => '%%{');
