"""Classify disposable GoTrue logs from stdin; never reproduce a log line."""
import json,re,sys
CODES=frozenset(['unexpected_failure', 'validation_failed', 'bad_json', 'email_exists', 'phone_exists', 'bad_jwt', 'not_admin', 'no_authorization', 'user_not_found', 'session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used', 'flow_state_not_found', 'flow_state_expired', 'signup_disabled', 'user_banned', 'provider_email_needs_verification', 'invite_not_found', 'bad_oauth_state', 'bad_oauth_callback', 'oauth_provider_not_supported', 'unexpected_audience', 'single_identity_not_deletable', 'email_conflict_identity_not_deletable', 'identity_already_exists', 'email_provider_disabled', 'phone_provider_disabled', 'too_many_enrolled_mfa_factors', 'mfa_factor_name_conflict', 'mfa_factor_not_found', 'mfa_ip_address_mismatch', 'mfa_challenge_expired', 'mfa_verification_failed', 'mfa_verification_rejected', 'insufficient_aal', 'captcha_failed', 'saml_provider_disabled', 'manual_linking_disabled', 'sms_send_failed', 'email_not_confirmed', 'phone_not_confirmed', 'reauth_nonce_missing', 'saml_relay_state_not_found', 'saml_relay_state_expired', 'saml_idp_not_found', 'saml_assertion_no_user_id', 'saml_assertion_no_email', 'user_already_exists', 'sso_provider_not_found', 'saml_metadata_fetch_failed', 'saml_idp_already_exists', 'sso_domain_already_exists', 'saml_entity_id_mismatch', 'conflict', 'provider_disabled', 'user_sso_managed', 'reauthentication_needed', 'same_password', 'reauthentication_not_valid', 'otp_expired', 'otp_disabled', 'identity_not_found', 'weak_password', 'over_request_rate_limit', 'over_email_send_rate_limit', 'over_sms_send_rate_limit', 'bad_code_verifier', 'anonymous_provider_disabled', 'hook_timeout', 'hook_timeout_after_retry', 'hook_payload_over_size_limit', 'hook_payload_invalid_content_type', 'request_timeout', 'mfa_phone_enroll_not_enabled', 'mfa_phone_verify_not_enabled', 'mfa_totp_enroll_not_enabled', 'mfa_totp_verify_not_enabled', 'mfa_webauthn_enroll_not_enabled', 'mfa_webauthn_verify_not_enabled', 'mfa_recovery_codes_enroll_not_enabled', 'mfa_recovery_codes_verify_not_enabled', 'mfa_recovery_codes_locked', 'mfa_recovery_codes_sole_factor', 'mfa_verified_factor_exists', 'invalid_credentials', 'email_address_not_authorized', 'email_address_invalid'])
CATEGORIES={
 'database_write':r'database error|sqlstate|failed to insert|handle_new_user|users_pkey',
 'smtp':r'smtp|sending confirmation email|mail server',
 'rate_limit':r'rate limit|too many requests',
 'network':r'connection refused|connection reset|timeout|timed out',
 'configuration':r'configuration|invalid config',
}
def classify(text):
 result={'schemaVersion':'stage20-auth-server-diagnostic.v1','categories':[],'sqlStates':[],'statuses':[],'authCodes':[]}
 result['categories']=sorted(k for k,pattern in CATEGORIES.items() if re.search(pattern,text,re.I))
 # Only explicitly labelled SQLSTATE, never body identifiers or arbitrary five-character tokens.
 result['sqlStates']=sorted(set(re.findall(r'(?i)SQLSTATE[\s:=\"\']+([0-9A-Z]{5})\b',text)))
 for line in text.splitlines():
  try:value=json.loads(line)
  except (ValueError,TypeError):continue
  if not isinstance(value,dict):continue
  status=value.get('status')
  if isinstance(status,int) and not isinstance(status,bool) and 100<=status<=599:result['statuses'].append(status)
  for key in ['code','error_code']:
   code=value.get(key)
   if isinstance(code,str) and code in CODES:result['authCodes'].append(code)
 result['statuses']=sorted(set(result['statuses']));result['authCodes']=sorted(set(result['authCodes']))
 return result
if __name__=='__main__':
 if sys.argv[1:]==['--self-test']:
  fixture='{"status":500,"code":"unexpected_failure","email":"private@example.invalid","error":"SMTP secret password SQLSTATE 23505"}'
  output=json.dumps(classify(fixture));assert 'private' not in output and 'password' not in output
  assert classify(fixture)['sqlStates']==['23505'];assert classify(fixture)['categories']==['database_write','smtp']
  assert classify('{"status":true,"code":"secret"}')['statuses']==[]
  print('auth_log_sanitized_selftest: PASS')
 else:
  assert not sys.argv[1:];data=sys.stdin.buffer.read(8*1024*1024+1)
  if len(data)>8*1024*1024:raise SystemExit('auth_log_input_limit')
  print(json.dumps(classify(data.decode('utf8',errors='replace')),sort_keys=True))
