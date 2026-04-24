ALTER TABLE public.exam_item_reviews
  ADD CONSTRAINT exam_item_reviews_review_id_item_number_key
  UNIQUE (review_id, item_number);