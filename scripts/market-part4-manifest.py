#!/usr/bin/env python3
"""The M2 part 4 manifest (ADR 0023): every act of the production opening, per environment, with its command
id derived from a fixed namespace, its arguments and its reason, concrete for one operational date.

Usage: market-part4-manifest.py --date AAAA-MM-DD --last-meeting N OUT.json

The date is the São Paulo date D of the run; the series window ends on D-1 and the list covers the meetings
from the anchor 235 to N. Every act's name carries what makes it concrete, and its command is UUID v5 of
`<environment>:<act>`, so a run on another day or with another meeting is a different command, never a replay
with different arguments. Acts whose argument comes from an earlier receipt (the delegation or schedule a
pause revokes, the jobs a pause cancels) name the command of that receipt; the executor resolves it.
"""
import argparse, datetime, json, uuid

NS = uuid.uuid5(uuid.NAMESPACE_URL, 'https://offroad.capital/market/m2-part4')
AUTH = 'Autorização do fundador de 22/10/2026 (M2 parte 4)'
ANCHOR = 235
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
SCHEDULES = {'series-432': ('series_432', {'coverageStart': '2021-01-14'}, 'Agenda diária da série 432'),
             'copom': ('copom_communiques', {'size': 20}, 'Agenda diária dos comunicados do Copom')}


def cmd(env, act):
    return str(uuid.uuid5(NS, f'{env}:{act}'))


def acts(env, day, last):
    e = ENVS[env]; a = e['actor']; t = e['token']; out = []
    eve = (day - datetime.timedelta(days=1)).isoformat()

    def add(act, fn, args, note=None):
        out.append({'act': act, 'command': cmd(env, act), 'function': fn, 'args': args, **({'note': note} if note else {})})

    def grants(prefix):
        add(f'{prefix}event-delegation', 'grant_market_event_delegation_v1', {'token': t, 'consumer': 'rg01-monitor',
            'reason': f'Delegação do worker ao monitor RG-01. {AUTH}.', 'actor': a})
        add(f'{prefix}acquisition-delegation', 'grant_market_acquisition_delegation_v1', {'token': t, 'source': 'bcb',
            'reason': f'Delegação de aquisição do worker para a fonte bcb. {AUTH}.', 'actor': a})

    def schedules(prefix):
        for key, (kind, params, label) in SCHEDULES.items():
            add(f'{prefix}schedule-{key}', 'grant_market_acquisition_schedule_v1', {'kind': kind, 'params': params, 'localTime': '09:00',
                'businessDaysOnly': False, 'reason': f'{label}. {AUTH}.', 'actor': a})

    add('publisher', 'register_market_publisher_v1', {'name': 'Offroad, referência de mercado', 'actor': a})
    add('source-revision-1', 'record_market_source_revision_v1', {'source': 'bcb', 'definition': SOURCE, 'actor': a})
    add('calendar-2026', 'record_market_copom_calendar_v1', {'year': 2026, 'meetings': MEETINGS, 'evidenceUrl': CAL_URL, 'evidenceSha256': CAL_SHA,
        'mediaType': 'application/json', 'reason': f'Calendário de 2026, Comunicado BCB nº 43.383. {AUTH}.', 'actor': a})
    add('consumer-rg01-monitor', 'register_market_event_consumer_v2', {'consumer': 'rg01-monitor', 'events': EVENTS,
        'subjectKinds': ['acquisition', 'source', 'version'], 'handler': 'rg01', 'reason': f'Consumidor do monitor do gatilho RG-01. {AUTH}.', 'actor': a})
    grants('')
    add('transport-open', 'release_market_acquisition_transport_v1', {'released': True, 'actor': a,
        'reason': f'Abertura do transporte para o bootstrap enumerado. {AUTH}.'}, "production: only after the founder's final release")
    add(f'bootstrap-list-{ANCHOR}-{last}', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-copom-comunicados-lista',
        'request': {'size': last - ANCHOR + 1}, 'reason': f'Bootstrap: lista dos comunicados das reuniões {ANCHOR} a {last}. {AUTH}.', 'actor': a})
    for n in range(ANCHOR, last + 1):
        add(f'bootstrap-detail-{n}', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-copom-comunicados-detalhe', 'request': {'meeting': n},
            'reason': f'Bootstrap: comunicado da reunião {n}. {AUTH}.', 'actor': a})
    if env == 'staging':
        add('corpus-series', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-sgs-432-endpoint',
            'request': {'window': {'start': '2021-01-14', 'end': '2026-10-21'}}, 'reason': f'Prova integrada: série da conferência da parte 0. {AUTH}.', 'actor': a})
    add(f'bootstrap-series-{day.isoformat()}', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-sgs-432-endpoint',
        'request': {'window': {'start': '2021-01-14', 'end': eve}}, 'reason': f'Bootstrap: série 432 de 2021-01-14 a {eve}. {AUTH}.', 'actor': a})
    add('odbl-edition-1', 'publish_market_odbl_release_v1', {'codeCommit': '<sha of the deployed main>', 'actor': a},
        'the commit deployed on the web and in the worker image')
    schedules('')
    # Pause: every argument either literal or the receipt of a named grant; the jobs are every non-terminal job.
    add('pause-transport', 'release_market_acquisition_transport_v1', {'released': False, 'actor': a, 'reason': f'Pausa da base de mercado: transporte. {AUTH}.'})
    for key in ('event-delegation', 'acquisition-delegation'):
        fn = 'revoke_market_event_delegation_v1' if key == 'event-delegation' else 'revoke_market_acquisition_delegation_v1'
        add(f'pause-{key}', fn, {'delegationOfGrant': cmd(env, key), 'reason': f'Pausa da base de mercado: {key}. {AUTH}.', 'actor': a})
    for key in SCHEDULES:
        add(f'pause-schedule-{key}', 'revoke_market_acquisition_schedule_v1', {'scheduleOfGrant': cmd(env, f'schedule-{key}'),
            'reason': f'Pausa da base de mercado: agenda {key}. {AUTH}.', 'actor': a})
    add('pause-cancel-<job>', 'cancel_market_acquisition_v1', {'jobs': "every market job of source bcb with status 'queued' or 'leased'",
        'reason': f'Pausa da base de mercado: job cancelado. {AUTH}.', 'actor': a}, 'one act per job; the act name carries the job id')
    add('withdraw-edition-<n>', 'withdraw_market_odbl_release_v1', {'release': '<n>', 'kind': "'quality' or 'rights'",
        'reason': f'Retirada da edição ODbL. {AUTH}.', 'actor': a}, 'only if the edition itself is wrong; a pause does not withdraw it')
    # Resumption: new acts, never replays of the revoked grants.
    add('resume-1-transport', 'release_market_acquisition_transport_v1', {'released': True, 'actor': a, 'reason': f'Retomada da base de mercado: transporte. {AUTH}.'})
    grants('resume-1-')
    add('resume-1-detail-<meeting>', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-copom-comunicados-detalhe', 'request': {'meeting': '<meeting>'},
        'reason': f'Retomada: comunicado cancelado na pausa. {AUTH}.', 'actor': a}, 'one act per meeting whose detail was cancelled and has no reference')
    add('resume-1-odbl-edition-<n>', 'publish_market_odbl_release_v1', {'codeCommit': '<sha of the deployed main>', 'actor': a}, 'only if an edition was withdrawn')
    schedules('resume-1-')
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--date', required=True)
    p.add_argument('--last-meeting', required=True, type=int)
    p.add_argument('out')
    args = p.parse_args()
    day = datetime.date.fromisoformat(args.date)
    if args.last_meeting < ANCHOR:
        raise SystemExit('the last meeting precedes the anchor')
    doc = {'schemaVersion': 'offroad.market-part4-manifest.v2', 'namespace': str(NS), 'authorization': AUTH, 'operationalDate': day.isoformat(),
           'lastMeeting': args.last_meeting, 'environments': {env: {**ENVS[env], 'acts': acts(env, day, args.last_meeting)} for env in ENVS}}
    with open(args.out, 'w') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
        fh.write('\n')


if __name__ == '__main__':
    main()
