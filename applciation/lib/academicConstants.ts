/** Shared by the forms and the API. Institutions can still type any qualification; these are the common choices. */
export const EDUCATION_LEVELS = ["School", "Higher Secondary", "Diploma", "Undergraduate", "Postgraduate", "Doctoral", "Other"] as const;

export const DOC_CATEGORIES = [
  ["TENTH_MARKS", "10th marks card"],
  ["TWELFTH_MARKS", "12th / PUC marks card"],
  ["DIPLOMA_CERTIFICATE", "Diploma certificate"],
  ["DEGREE_MARKS", "Degree marks cards"],
  ["DEGREE_CERTIFICATE", "Degree certificate"],
  ["PROVISIONAL_CERTIFICATE", "Provisional certificate"],
  ["OTHER", "Other academic certificate"],
] as const;
