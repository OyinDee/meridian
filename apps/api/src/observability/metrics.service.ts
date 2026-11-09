import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

/** Shape of a registry snapshot, derived from prom-client so it cannot drift. */
type MetricsJson = Awaited<ReturnType<Registry['getMetricsAsJSON']>>;

/**
 * Prometheus metrics. The bank-specific series are the interesting ones: posting
 * latency per journal kind, serialization retries, and outbox backlog, which is the
 * earliest signal that real-time delivery is falling behind.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly postingsTotal: Counter<'kind' | 'outcome'>;
  readonly postingDuration: Histogram<'kind'>;
  readonly transactionRetries: Counter<'reason'>;
  readonly transfersTotal: Counter<'channel' | 'status'>;
  readonly riskDecisions: Counter<'decision' | 'rule'>;
  readonly sseConnections: Gauge<'state'>;
  readonly outboxBacklog: Gauge<'state'>;
  readonly ledgerImbalance: Gauge<string>;

  constructor() {
    this.registry.setDefaultLabels({ service: 'meridian-api' });
    collectDefaultMetrics({ register: this.registry });

    this.postingsTotal = new Counter({
      name: 'meridian_postings_total',
      help: 'Journal transactions posted, by kind and outcome.',
      labelNames: ['kind', 'outcome'],
      registers: [this.registry],
    });

    this.postingDuration = new Histogram({
      name: 'meridian_posting_duration_seconds',
      help: 'Wall time to commit a balanced journal transaction.',
      labelNames: ['kind'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });

    this.transactionRetries = new Counter({
      name: 'meridian_transaction_retries_total',
      help: 'Transactions retried after a serialization failure or deadlock.',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.transfersTotal = new Counter({
      name: 'meridian_transfers_total',
      help: 'Transfers by rail and terminal status.',
      labelNames: ['channel', 'status'],
      registers: [this.registry],
    });

    this.riskDecisions = new Counter({
      name: 'meridian_risk_decisions_total',
      help: 'Risk engine decisions, by outcome and triggering rule.',
      labelNames: ['decision', 'rule'],
      registers: [this.registry],
    });

    this.sseConnections = new Gauge({
      name: 'meridian_sse_connections',
      help: 'Live real-time subscribers.',
      labelNames: ['state'],
      registers: [this.registry],
    });

    this.outboxBacklog = new Gauge({
      name: 'meridian_outbox_events',
      help: 'Outbox rows by state (pending/published/failed) and their age.',
      labelNames: ['state'],
      registers: [this.registry],
    });

    this.ledgerImbalance = new Gauge({
      name: 'meridian_ledger_imbalance_minor',
      help: 'Sum of debits minus credits across the whole ledger. Must be 0.',
      registers: [this.registry],
    });
  }

  scrape(): Promise<string> {
    return this.registry.metrics();
  }

  /** Used by tests to assert on emitted series. */
  async allMetrics(): Promise<MetricsJson> {
    return this.registry.getMetricsAsJSON();
  }
}
