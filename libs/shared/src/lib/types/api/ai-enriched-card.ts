export interface AiEnrichedCard {
  cardId: string;
  termQuestion: string;
  definitionQuestion: string;
  termDistractors: string[];
  definitionDistractors: string[];
}
