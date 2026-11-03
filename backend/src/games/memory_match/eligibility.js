// The picker and dealing endpoint must count the same unambiguous pairs.
export const memoryAnswerKeySql =
  "lower(regexp_replace(trim(o.option_text), '[[:space:]]+', ' ', 'g'))";
const eligibleSql =
  "q.question_type IN ('multiple_choice','true_false') AND length(trim(q.question_text))>0 AND length(trim(o.option_text))>0";
const fromSql = `FROM questions q JOIN question_options o ON o.question_id=q.question_id AND o.is_correct=true WHERE q.quiz_id=$1 AND ${eligibleSql}`;
export const memoryCountSql = `SELECT count(DISTINCT ${memoryAnswerKeySql})::int AS count ${fromSql}`;
export const memoryQuestionsSql = `SELECT question_id,question_text,correct_option_text FROM (
 SELECT DISTINCT ON (${memoryAnswerKeySql}) q.question_id,q.question_text,o.option_text AS correct_option_text
 ${fromSql} ORDER BY ${memoryAnswerKeySql},random()
) distinct_answers ORDER BY random() LIMIT $2`;
