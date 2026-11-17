'use client';

import {Activity, startTransition, useReducer, useRef} from 'react';
import {produce} from 'immer';
import {useInterval} from '@reactuses/core';
import {parseAsString, parseAsStringLiteral, useQueryState} from 'nuqs';
import {MonitorLevel} from '@repo/shared/constants/monitor.js';
import {Card, CardAction, CardHeader, CardTitle} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {useDocumentTitle} from '@/hooks/use-document-title';
import {ScrollButtons} from '@/components/common/scroll-buttons';
import {ErrorAlert} from '@/components/common/status-alerts.js';
import {formatTime} from '@/lib/datetime';
import {DEFAULT_MIN_LEVEL, levelIndex} from '../lib/levels';
import {useMonitorSocket} from '../hooks/use-monitor-socket';
import {MonitorStream} from './monitor-stream';

const MAX_ROWS = 2000;
const FLUSH_INTERVAL_MS = 200;
const LEVEL_ITEMS = MonitorLevel.toList({extra: ({value}) => ({label: value})});

const levelParser = parseAsStringLiteral(MonitorLevel.values).withDefault(
  DEFAULT_MIN_LEVEL,
);

function matchesScope(eventName, scope) {
  return eventName === scope || eventName.startsWith(`${scope}.`);
}

const streamsReducer = produce((draft, action) => {
  switch (action.type) {
    case 'appendBatch': {
      for (const {scope, cardKey, title, row} of action.items) {
        draft[scope] ??= {};
        draft[scope][cardKey] ??= {key: cardKey, title, rows: []};
        const card = draft[scope][cardKey];
        card.title = title;
        card.rows.unshift(row);
        if (card.rows.length > MAX_ROWS) {
          card.rows.length = MAX_ROWS;
        }
      }
      break;
    }
    case 'clearCard': {
      const card = draft[action.scope]?.[action.cardKey];
      if (card) {
        card.rows = [];
      }
      break;
    }
  }
});

export function MonitorBoard({scopes, source, title}) {
  const [streams, dispatch] = useReducer(streamsReducer, {});
  const [minLevel, setMinLevel] = useQueryState('level', levelParser);
  const [scopeParam, setActiveScope] = useQueryState('tab', parseAsString);
  const activeScope = scopes.includes(scopeParam) ? scopeParam : scopes[0];
  const rowSeq = useRef(0);
  const pendingRef = useRef([]);
  const heading = title || scopes.join(' | ');

  useDocumentTitle(heading);

  const handleEvent = (eventName, payload) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (levelIndex(payload.level) < levelIndex(minLevel)) {
      return;
    }
    const row = {
      key: rowSeq.current++,
      time: formatTime(new Date()),
      message: payload.message,
      level: payload.level,
      data: payload.data ?? null,
    };
    for (const scope of scopes) {
      if (!matchesScope(eventName, scope)) {
        continue;
      }
      pendingRef.current.push({
        scope,
        cardKey: `${eventName}#${payload.id}`,
        title: payload.title || eventName,
        row,
      });
    }
  };

  useInterval(() => {
    if (!pendingRef.current.length) {
      return;
    }
    const items = pendingRef.current;
    pendingRef.current = [];
    startTransition(() => dispatch({type: 'appendBatch', items}));
  }, FLUSH_INTERVAL_MS);

  const {error} = useMonitorSocket({source, onEvent: handleEvent});

  const renderStream = scope => (
    <MonitorStream
      cards={Object.values(streams[scope] ?? {})}
      onClearCard={cardKey => dispatch({type: 'clearCard', scope, cardKey})}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <ScrollButtons />
      <Card>
        <CardHeader hasDivider={false}>
          <CardTitle variant="primary" casing="upper">
            {heading}
          </CardTitle>
          <CardAction className="flex flex-wrap items-center gap-2">
            <Select
              items={LEVEL_ITEMS}
              value={minLevel}
              onValueChange={value => setMinLevel(value)}
            >
              <SelectTrigger
                size="sm"
                tooltip="Gösterilecek en düşük log seviyesi"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {LEVEL_ITEMS.map(item => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </CardAction>
        </CardHeader>
      </Card>
      {error ? (
        <ErrorAlert>{error.message}</ErrorAlert>
      ) : scopes.length > 1 ? (
        <Tabs
          value={activeScope}
          onValueChange={value => setActiveScope(value)}
        >
          <TabsList className="mx-auto">
            {scopes.map(scope => (
              <TabsTrigger key={scope} value={scope}>
                {scope}
              </TabsTrigger>
            ))}
          </TabsList>
          {scopes.map(scope => (
            <TabsContent key={scope} value={scope} keepMounted>
              <Activity mode={scope === activeScope ? 'visible' : 'hidden'}>
                {renderStream(scope)}
              </Activity>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        renderStream(scopes[0])
      )}
    </div>
  );
}
