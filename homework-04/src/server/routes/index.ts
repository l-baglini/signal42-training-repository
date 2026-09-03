import { Router, json } from 'express';
import { Db, Filter } from 'mongodb';
import { DateTime } from 'luxon';
import { ssps } from '../../ssp-list';
import { SellerRecord } from '../../types';
import { parseAdsTxt } from '../adstxt';
import { validate } from '../validate';

export const router = Router();

router.get('/', (_req, res) => res.redirect('/sellers'));

router.get('/sellers', async (req, res) => {
  const db = req.app.get('database') as Db;
  const collection = db.collection<SellerRecord>('sellers');

  const selectedSSPs =
    (req.query['ssp_ids'] as string | undefined)?.split(',').map(Number) ?? ssps.map((_ssp, index) => index);
  const page = req.query['page'] ? Number(req.query['page']) : 0;
  const pageSize = req.query['page-size'] ? Math.min(Number(req.query['page-size']), 10000) : 20;
  const fromDate = req.query['from-date'] as string | undefined;
  const toDate = req.query['to-date'] as string | undefined;

  const sellersBySSP = await Promise.all(
    ssps
      .filter((_ssp, index) => selectedSSPs.includes(index))
      .map(async (ssp) => {
        const match: Filter<SellerRecord> = { sspDomain: ssp.domain };
        const importDate: Record<string, Date> = {};
        if (fromDate) importDate.$gte = new Date(fromDate);
        if (toDate) importDate.$lte = DateTime.fromISO(toDate).plus({ days: 1 }).toJSDate();
        if (Object.keys(importDate).length > 0) match.importDate = importDate;

        return {
          domain: ssp.domain,
          sellers: await collection
            .aggregate<SellerRecord>([
              { $match: match },
              { $sort: { sellerId: -1 } },
              { $skip: pageSize * page },
              { $limit: pageSize },
            ])
            .toArray(),
        };
      }),
  );

  return res.render('index', {
    page,
    pageSize,
    fromDate,
    toDate,
    ssps: ssps.map((ssp, index) => {
      const isSelected = selectedSSPs.includes(index);
      const sellers = sellersBySSP
        .find((entry) => entry.domain === ssp.domain)
        ?.sellers.map((seller) => ({
          ...seller,
          importDate: DateTime.fromJSDate(seller.importDate).toFormat('dd/MM/yyyy'),
          importDiff: Math.ceil(DateTime.now().diff(DateTime.fromJSDate(seller.importDate), 'days').days),
        }));
      return {
        ...ssp,
        isSelected,
        hasNumericId: ssp.numericSellerId,
        sellers: isSelected ? sellers : null,
      };
    }),
  });
});

router.get('/ads-txt', async (_req, res) => {
  return res.render('ads_txt');
});

router.post(
  '/ads-txt',
  json(),
  validate({
    type: 'object',
    additionalProperties: false,
    required: ['domain'],
    properties: {
      domain: { type: 'string' },
    },
  }),
  async (req, res) => {
    try {
      const db = req.app.get('database') as Db;
      return res.status(200).send({
        contents: await parseAdsTxt(db.collection<SellerRecord>('sellers'), req.body.domain),
      });
    } catch {
      return res.status(500).send();
    }
  },
);
