CREATE OR REPLACE FUNCTION increment_email_open(p_business_id uuid)
RETURNS void AS $$
  UPDATE public.businesses
  SET email_opens_count = email_opens_count + 1,
      email_last_opened_at = now()
  WHERE id = p_business_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_email_click(p_business_id uuid)
RETURNS void AS $$
  UPDATE public.businesses
  SET email_clicks_count = email_clicks_count + 1,
      email_last_clicked_at = now()
  WHERE id = p_business_id;
$$ LANGUAGE sql SECURITY DEFINER;
;
