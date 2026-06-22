export interface AiTrueFalseStatements {
  trueStatement: string;
  falseStatement: string;
}

export interface AiEnrichedCard {
  cardId: string;
  termQuestion: string;
  definitionQuestion: string;
  termDistractors: string[];
  definitionDistractors: string[];
  termTrueFalseStatements?: AiTrueFalseStatements;
  definitionTrueFalseStatements?: AiTrueFalseStatements;
}
