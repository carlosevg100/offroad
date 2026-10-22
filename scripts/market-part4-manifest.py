#!/usr/bin/env python3
"""The M2 part 4 manifest (ADR 0023): every act of the production opening, per environment, with its command
id derived from a fixed namespace, its arguments and its reason. Usage: market-part4-manifest.py OUT.json"""
import json, uuid, sys
NS = uuid.uuid5(uuid.NAMESPACE_URL, 'https://offroad.capital/market/m2-part4')
AUTH = 'Autorização do fundador de 22/10/2026 (M2 parte 4)'
ENVS = {
 'staging': {'project': 'gjkkjtbfnssdsbmlhmwk', 'actor': str(uuid.uuid5(NS, 'staging:founder')), 'token': str(uuid.uuid5(NS, 'staging:worker-token')),
             'account': str(uuid.uuid5(NS, 'staging:worker-account'))},
 'production': {'project': 'ifnogpksgdadruooqydi', 'actor': 'b60448ce-965a-4303-ae39-50447450c2aa', 'token': '655b20e1-3bac-4ad5-a8be-77f5b7687fa0',
                'account': '5ed2e540-b8f0-40a2-88a5-c3daf7a7cba5'},
}
SOURCE = {'registryId': 'bcb_sgs', 'license': {'kind': 'open', 'license': 'ODbL-1.0', 'attribution': 'Banco Central do Brasil',
  'evidenceIds': ['bcb-catalog-meta-selic-432', 'bcb-catalog-atas-comunicados-copom', 'bcb-site-termos-de-uso'], 'retainAdoptedValues': True, 'storeDays': None},
  'allowedHosts': ['api.bcb.gov.br', 'www.bcb.gov.br'], 'calendar': 'br_business_days', 'expectedPublication': '09:00', 'maximumAgeHours': 30, 'enabled': True,
  'reason': f'Revisão 1 da fonte bcb, licença aberta ODbL do catálogo de dados abertos do Banco Central. {AUTH}.'}
MEETINGS = [{'ordinal': i + 1, 'firstDay': a, 'secondDay': b} for i, (a, b) in enumerate([
 ('2026-01-27', '2026-01-28'), ('2026-03-17', '2026-03-18'), ('2026-04-28', '2026-04-29'), ('2026-06-16', '2026-06-17'),
 ('2026-08-04', '2026-08-05'), ('2026-09-15', '2026-09-16'), ('2026-11-03', '2026-11-04'), ('2026-12-08', '2026-12-09')])]
CAL_URL = 'https://www.bcb.gov.br/api/conteudo/app/normativos/exibeoutrasnormas?p1=COMUNICADO&p2=43383'
CAL_SHA = '13a3738730bacd2938c3761d788733e6c281298242fd6f17a2813997cb0064c5'
EVENTS = ['approved', 'quarantined', 'superseded', 'revoked', 'purged', 'released']

def cmd(env, act):
    return str(uuid.uuid5(NS, f'{env}:{act}'))

def acts(env):
    e = ENVS[env]; a = e['actor']; t = e['token']; out = []
    def add(act, fn, args, note=None):
        out.append({'act': act, 'command': cmd(env, act), 'function': fn, 'args': args, **({'note': note} if note else {})})
    add('publisher', 'register_market_publisher_v1', {'name': 'Offroad, referência de mercado', 'actor': a})
    add('source-revision-1', 'record_market_source_revision_v1', {'source': 'bcb', 'definition': SOURCE, 'actor': a})
    add('calendar-2026', 'record_market_copom_calendar_v1', {'year': 2026, 'meetings': MEETINGS, 'evidenceUrl': CAL_URL, 'evidenceSha256': CAL_SHA,
        'mediaType': 'application/json', 'reason': f'Calendário de 2026, Comunicado BCB nº 43.383. {AUTH}.', 'actor': a})
    add('consumer-rg01-monitor', 'register_market_event_consumer_v2', {'consumer': 'rg01-monitor', 'events': EVENTS, 'subjectKinds': ['acquisition', 'source', 'version'],
        'handler': 'rg01', 'reason': f'Consumidor do monitor do gatilho RG-01. {AUTH}.', 'actor': a})
    add('event-delegation', 'grant_market_event_delegation_v1', {'token': t, 'consumer': 'rg01-monitor', 'reason': f'Delegação do worker ao monitor RG-01. {AUTH}.', 'actor': a})
    add('acquisition-delegation', 'grant_market_acquisition_delegation_v1', {'token': t, 'source': 'bcb', 'reason': f'Delegação de aquisição do worker para a fonte bcb. {AUTH}.', 'actor': a})
    add('transport-open', 'release_market_acquisition_transport_v1', {'released': True, 'actor': a, 'reason': f'Abertura do transporte para o bootstrap enumerado. {AUTH}.'},
        'production: only after the founder\'s final release')
    add('bootstrap-list', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-copom-comunicados-lista', 'request': {'size': 47},
        'reason': f'Bootstrap: lista dos comunicados desde a reunião 235. {AUTH}.', 'actor': a}, 'size = latest meeting - 235 + 1 on the execution day')
    for n in range(235, 282):
        add(f'bootstrap-detail-{n}', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-copom-comunicados-detalhe', 'request': {'meeting': n},
            'reason': f'Bootstrap: comunicado da reunião {n}. {AUTH}.', 'actor': a})
    if env == 'staging':
        add('corpus-series', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-sgs-432-endpoint', 'request': {'window': {'start': '2021-01-14', 'end': '2026-10-21'}},
            'reason': f'Prova integrada: série da conferência da parte 0. {AUTH}.', 'actor': a})
    add('bootstrap-series-<D>', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-sgs-432-endpoint', 'request': {'window': {'start': '2021-01-14', 'end': '<D-1>'}},
        'reason': f'Bootstrap: série 432 desde o recorte homologado até a véspera de <D>. {AUTH}.', 'actor': a}, 'command derived with the execution date D in the act name')
    add('odbl-edition-1', 'publish_market_odbl_release_v1', {'codeCommit': '<deployed main sha>', 'actor': a})
    add('schedule-series-432', 'grant_market_acquisition_schedule_v1', {'kind': 'series_432', 'params': {'coverageStart': '2021-01-14'}, 'localTime': '09:00',
        'businessDaysOnly': False, 'reason': f'Agenda diária da série 432. {AUTH}.', 'actor': a})
    add('schedule-copom', 'grant_market_acquisition_schedule_v1', {'kind': 'copom_communiques', 'params': {'size': 20}, 'localTime': '09:00',
        'businessDaysOnly': False, 'reason': f'Agenda diária dos comunicados do Copom. {AUTH}.', 'actor': a})
    for act, fn in [('pause-transport', 'release_market_acquisition_transport_v1'), ('pause-acquisition-delegation', 'revoke_market_acquisition_delegation_v1'),
                    ('pause-event-delegation', 'revoke_market_event_delegation_v1'), ('pause-schedules', 'revoke_market_acquisition_schedule_v1')]:
        add(act, fn, {'reason': f'Pausa da base de mercado ({act}). {AUTH}.', 'actor': a}, 'reversal; resumption uses new acts with a resume-<n> suffix')
    return out

doc = {'schemaVersion': 'offroad.market-part4-manifest.v1', 'namespace': str(NS), 'authorization': AUTH,
       'environments': {env: {**ENVS[env], 'acts': acts(env)} for env in ENVS}}
json.dump(doc, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1); open(sys.argv[1], 'a').write('\n')
