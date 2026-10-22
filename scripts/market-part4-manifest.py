#!/usr/bin/env python3
"""The M2 part 4 manifest (ADR 0023): every act of the production opening, per environment, with its command
id derived from a fixed namespace, its arguments and its reason, concrete for one operational date.

Usage: market-part4-manifest.py --date AAAA-MM-DD --last-meeting N OUT.json
       market-part4-manifest.py --expand ENV TEMPLATE key=value ...   (one concrete act, printed)

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
    schedules('')
    if env == 'staging':
        add(f'rehearsal-list-234-{last}', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-copom-comunicados-lista',
            'request': {'size': last - 234 + 1}, 'reason': f'Ensaio da pausa: lista das reuniões 234 a {last}. {AUTH}.', 'actor': a},
            'staging only: the confirmed list records meeting 234')
        add('rehearsal-detail-234', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-copom-comunicados-detalhe', 'request': {'meeting': 234},
            'reason': f'Ensaio da pausa: comunicado da reunião 234, cancelado pela pausa. {AUTH}.', 'actor': a},
            'staging only: enqueued with the runner stopped, so the pause finds it queued')
    # Pause and resumption cycles. A pause closes the transport and revokes whatever grant is live at that
    # moment (resolved at run time, so a pause in the middle of the bootstrap revokes only what exists); a
    # resumption grants anew with its own commands and acquires again whatever the pause cancelled.
    for k in range(1, CYCLES + 1):
        add(f'pause-{k}-transport', 'release_market_acquisition_transport_v1', {'released': False, 'actor': a,
            'reason': f'Pausa {k} da base de mercado: transporte. {AUTH}.'})
        add(f'resume-{k}-transport', 'release_market_acquisition_transport_v1', {'released': True, 'actor': a,
            'reason': f'Retomada {k} da base de mercado: transporte. {AUTH}.'})
        grants(f'resume-{k}-')
        schedules(f'resume-{k}-')
    return out


CYCLES = 4


def supplement(day, last):
    """A staging run on the production day D, when it differs from the proof's: its own worker identity and
    commands, the same series request as production, and its own closing."""
    env = f'staging-supplement-{day.isoformat()}'
    base = ENVS['staging']; a = base['actor']
    t = str(uuid.uuid5(NS, f'{env}:worker-token')); account = str(uuid.uuid5(NS, f'{env}:worker-account'))
    eve = (day - datetime.timedelta(days=1)).isoformat(); out = []
    def add(act, fn, args):
        out.append({'act': act, 'command': cmd(env, act), 'function': fn, 'args': args})
    add('acquisition-delegation', 'grant_market_acquisition_delegation_v1', {'token': t, 'source': 'bcb',
        'reason': f'Execução suplementar de staging em {day.isoformat()}: delegação de aquisição. {AUTH}.', 'actor': a})
    add('transport-open', 'release_market_acquisition_transport_v1', {'released': True, 'actor': a,
        'reason': f'Execução suplementar de staging em {day.isoformat()}: transporte. {AUTH}.'})
    add(f'bootstrap-series-{day.isoformat()}', 'enqueue_market_contract_acquisition_v1', {'contract': 'bcb-sgs-432-endpoint',
        'request': {'window': {'start': '2021-01-14', 'end': eve}}, 'reason': f'Execução suplementar: série 432 de 2021-01-14 a {eve}. {AUTH}.', 'actor': a})
    add('close-transport', 'release_market_acquisition_transport_v1', {'released': False, 'actor': a,
        'reason': f'Execução suplementar de staging em {day.isoformat()}: fechamento. {AUTH}.'})
    return env, {'project': base['project'], 'actor': a, 'token': t, 'account': account, 'acts': out,
                 'note': 'only when the production bootstrap runs on another day than the proof; the delegation is revoked and the token revoked at the end'}


def templates(env):
    a = ENVS[env]['actor']; t = ENVS[env]['token']
    return [
     {'template': 'pause-<k>-revoke-acquisition-delegation-<id>', 'function': 'revoke_market_acquisition_delegation_v1',
      'args': {'delegation': '<id>', 'reason': f'Pausa <k> da base de mercado: delegação de aquisição. {AUTH}.', 'actor': a},
      'expandFor': 'the live acquisition delegation of the worker token for source bcb at pause <k>, if any'},
     {'template': 'pause-<k>-revoke-event-delegation-<id>', 'function': 'revoke_market_event_delegation_v1',
      'args': {'delegation': '<id>', 'reason': f'Pausa <k> da base de mercado: delegação de evento. {AUTH}.', 'actor': a},
      'expandFor': 'the live event delegation of the worker token for rg01-monitor at pause <k>, if any'},
     {'template': 'pause-<k>-revoke-schedule-<id>', 'function': 'revoke_market_acquisition_schedule_v1',
      'args': {'schedule': '<id>', 'reason': f'Pausa <k> da base de mercado: agenda. {AUTH}.', 'actor': a},
      'expandFor': 'each live schedule at pause <k>'},
     {'template': 'pause-<k>-cancel-<job>', 'function': 'cancel_market_acquisition_v1',
      'args': {'job': '<job>', 'reason': f'Pausa <k> da base de mercado: job cancelado. {AUTH}.', 'actor': a},
      'expandFor': "each market job of source bcb with status 'queued' or 'leased' at pause <k>"},
     {'template': 'resume-<k>-list-235-<last>', 'function': 'enqueue_market_contract_acquisition_v1',
      'args': {'contract': 'bcb-copom-comunicados-lista', 'request': {'size': '<size>'}, 'reason': f'Retomada <k>: lista do bootstrap cancelada na pausa. {AUTH}.', 'actor': a},
      'expandFor': 'the bootstrap list, when the pause cancelled it before it was confirmed'},
     {'template': 'resume-<k>-detail-<meeting>', 'function': 'enqueue_market_contract_acquisition_v1',
      'args': {'contract': 'bcb-copom-comunicados-detalhe', 'request': {'meeting': '<meeting>'}, 'reason': f'Retomada <k>: comunicado cancelado na pausa. {AUTH}.', 'actor': a},
      'expandFor': 'each meeting whose detail was cancelled at pause <k> and has no reference'},
     {'template': 'resume-<k>-series-<date>', 'function': 'enqueue_market_contract_acquisition_v1',
      'args': {'contract': 'bcb-sgs-432-endpoint', 'request': {'window': {'start': '2021-01-14', 'end': '<eve>'}},
               'reason': f'Retomada <k>: série do bootstrap cancelada na pausa. {AUTH}.', 'actor': a},
      'expandFor': 'the bootstrap series, when the pause cancelled it before it was confirmed; <date> is the day of the resumption'},
     {'template': 'odbl-edition-<release>', 'function': 'publish_market_odbl_release_v1', 'args': {'codeCommit': '<commit>', 'actor': a},
      'expandFor': 'every edition, the first included (step I: release=1), with the commit deployed on the web and in the worker'},
     {'template': 'withdraw-edition-<release>', 'function': 'withdraw_market_odbl_release_v1',
      'args': {'release': '<release>', 'kind': '<kind>', 'reason': f'Retirada da edição ODbL <release>. {AUTH}.', 'actor': a},
      'expandFor': 'only an edition that is itself wrong; kind is quality or rights'},
    ]


def expand(env, template, values):
    """One concrete act from a template: every placeholder filled, the command derived from the concrete name.
    Values that follow from others are derived here, never taken as input: the list size from the last meeting
    and the eve of the series window from the date, so one name can never carry two different requests."""
    values = dict(values)
    for derived in ('size', 'eve'):
        if derived in values:
            raise SystemExit(f'{derived} is derived, not an input')
    if 'last' in values:
        values['size'] = str(int(values['last']) - ANCHOR + 1)
    if 'date' in values:
        values['eve'] = (datetime.date.fromisoformat(values['date']) - datetime.timedelta(days=1)).isoformat()
    t = next(x for x in templates(env) if x['template'] == template)
    def fill(v):
        if isinstance(v, dict): return {k: fill(x) for k, x in v.items()}
        if isinstance(v, str):
            for key, value in values.items(): v = v.replace(f'<{key}>', value)
            if '<' in v and '>' in v: raise SystemExit(f'unfilled placeholder in {v}')
            return int(v) if key_is_int(v) else v
        return v
    name = fill(t['template'])
    return {'act': name, 'command': cmd(env, name), 'function': t['function'], 'args': fill(t['args'])}


def key_is_int(v):
    return v.isdigit() and len(v) < 6


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--date')
    p.add_argument('--last-meeting', type=int)
    p.add_argument('--expand', nargs='+', metavar=('ENV TEMPLATE', 'KEY=VALUE'))
    p.add_argument('out', nargs='?')
    args = p.parse_args()
    if args.expand:
        env, template, *pairs = args.expand
        print(json.dumps(expand(env, template, dict(x.split('=', 1) for x in pairs)), ensure_ascii=False))
        return
    if not (args.date and args.last_meeting and args.out):
        raise SystemExit('--date, --last-meeting and OUT are required')
    day = datetime.date.fromisoformat(args.date)
    if args.last_meeting < ANCHOR:
        raise SystemExit('the last meeting precedes the anchor')
    doc = {'schemaVersion': 'offroad.market-part4-manifest.v2', 'namespace': str(NS), 'authorization': AUTH, 'operationalDate': day.isoformat(),
           'lastMeeting': args.last_meeting,
           'environments': {env: {**ENVS[env], 'acts': acts(env, day, args.last_meeting), 'templates': templates(env)} for env in ENVS}}
    senv, sdoc = supplement(day, args.last_meeting)
    doc['environments'][senv] = sdoc
    for env in doc['environments']:
        for act in doc['environments'][env]['acts']:
            if '<' in json.dumps(act):
                raise SystemExit(f'placeholder in a concrete act: {act["act"]}')
    with open(args.out, 'w') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
        fh.write('\n')


if __name__ == '__main__':
    main()
