-- NULL preserves the audience of existing resources. New uploads select one year.
ALTER TABLE resources ADD COLUMN target_year smallint
  CHECK (target_year BETWEEN 1 AND 3);
CREATE INDEX resources_module_target_year_idx ON resources(module_id,target_year,created_date DESC);
