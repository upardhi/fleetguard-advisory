-- Third-party API call log
-- Every outbound call to an external vendor (IDfy, MSG91, Google Vision, etc.)
-- is recorded here fire-and-forget for auditing and usage counting.

CREATE TABLE IF NOT EXISTS fg_api_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service         TEXT        NOT NULL,  -- 'idfy' | 'msg91' | 'google_vision' | 'crime_check' | 'bg_vendor'
  operation       TEXT        NOT NULL,  -- 'dl_verify_submit' | 'dl_verify_poll' | 'rc_verify_submit' | 'rc_verify_poll'
                                         -- 'dl_ocr_submit' | 'dl_ocr_poll' | 'face_detect'
                                         -- 'send_sms' | 'crime_check_initiate' | 'crime_check_poll' | 'bg_check_trigger'
  method          TEXT        NOT NULL,  -- HTTP method
  url             TEXT        NOT NULL,  -- sanitized URL (API keys redacted)
  request_body    JSONB,                 -- sanitized request payload (auth headers stripped)
  response_status INTEGER,               -- HTTP status code; NULL on network error
  response_body   JSONB,                 -- response payload (truncated to 10 KB)
  duration_ms     INTEGER     NOT NULL,  -- wall-clock time for the call
  success         BOOLEAN     NOT NULL,  -- response_status < 400 (or false on network error)
  error_message   TEXT,                  -- exception message on network failure
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes optimised for "how many X calls did we make?" style queries
CREATE INDEX IF NOT EXISTS fg_api_logs_service_idx       ON fg_api_logs (service);
CREATE INDEX IF NOT EXISTS fg_api_logs_operation_idx     ON fg_api_logs (operation);
CREATE INDEX IF NOT EXISTS fg_api_logs_created_at_idx    ON fg_api_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS fg_api_logs_service_date_idx  ON fg_api_logs (service, created_at DESC);
CREATE INDEX IF NOT EXISTS fg_api_logs_success_idx       ON fg_api_logs (success) WHERE success = FALSE;
