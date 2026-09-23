// `left-pad` is imported and declared nowhere; `never-imported` is declared and
// appears here only inside a comment, which the scanner strips before it looks.
import leftPad from 'left-pad';

export const padded = leftPad('x', 2);
