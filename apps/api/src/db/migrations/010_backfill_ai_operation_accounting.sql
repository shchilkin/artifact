UPDATE ai_usage_monthly
SET committed_generation_count = GREATEST(committed_generation_count, generation_count),
    reserved_generation_count = 0
WHERE committed_generation_count < generation_count
   OR reserved_generation_count <> 0;
