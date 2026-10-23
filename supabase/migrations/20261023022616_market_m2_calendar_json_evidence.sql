-- Market reference M2 part 4 (ADR 0023): the Copom calendar may be evidenced by the JSON the Banco Central's
-- site serves for a normative act. The 2026 calendar is Comunicado nº 43.383, which the site publishes only
-- through its normative API (application/json); its page is an application shell without the text and there
-- is no PDF. The evidence keeps the bytes of that response as received, with their own media type.
alter table private.market_copom_calendar_evidence drop constraint market_copom_calendar_evidence_media_type_check;
alter table private.market_copom_calendar_evidence add constraint market_copom_calendar_evidence_media_type_check
 check(media_type in ('text/html','application/pdf','application/json'));
