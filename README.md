# BarcodeBridge

Una piccola app open source per trovare candidati EAN/UPC a partire da un nome prodotto, un ASIN, un URL Amazon o un barcode già noto. Mostra le fonti, verifica la cifra di controllo e rende il codice scansionabile dallo schermo.

## Avvio

Richiede Node.js 20.19+ e npm. Da questa cartella:

```bash
npm install
npm run build -w @barcodebridge/core
npm run dev
```

Apri http://localhost:5173. L'API gira su http://localhost:3001 e Vite inoltra `/api` durante lo sviluppo.

Per la build: `npm run build`, poi `npm run start -w @barcodebridge/api` e servi `apps/web/dist` con un server statico che inoltri `/api` all'API. Per eseguire i test: `npm test` dopo la build del core.

## Fonti

- UPCitemdb (trial gratuito, con limiti di frequenza e di richieste)
- Open Food Facts e Open Beauty Facts (ricerca per nome o codice)
- Barcode Lookup, solo se imposti `BARCODELOOKUP_API_KEY` nell'ambiente del backend
- Coppie ASIN/EAN verificate e documentate in `apps/api/src/verified-pairs.ts` (attualmente un prodotto)
- Ricerca web per altri ASIN, se imposti `BRAVE_SEARCH_API_KEY` nell'ambiente del backend

Queste fonti possono essere temporaneamente indisponibili o restituire dati incompleti. L'API raccoglie le risposte in parallelo e mostra le fonti che non hanno risposto. Nessuna chiave API va inserita nella web app.

**ASIN:** `B09SY5QHHJ` restituisce `8054383070350` senza chiavi API: due pagine di venditori riportano esplicitamente entrambi i codici. Le fonti e la data del controllo sono visibili nel risultato. Questa è una coppia verificata nel progetto, non una conversione matematica dell'ASIN. Per ASIN non presenti nell'archivio serve un provider configurato: `BRAVE_SEARCH_API_KEY` cerca pagine contenenti ASIN ed EAN, mentre `BARCODELOOKUP_API_KEY` interroga il catalogo per ASIN. In assenza di entrambi, aggiungi il nome preciso, la marca e il formato nel campo facoltativo. Una ricerca web può fornire indizi sbagliati o non trovare risultati; il progetto non estrae dati direttamente da Amazon.

Per configurare un provider facoltativo, imposta la variabile nell'ambiente **prima** di avviare `npm run dev`, ad esempio `BRAVE_SEARCH_API_KEY=... npm run dev`. Non inserire le chiavi in `apps/web` o nel repository. La ricerca web riconosce soltanto codici vicini alle etichette EAN/UPC/GTIN in risultati che contengono anche l'ASIN; non considera una coincidenza tra numeri una prova definitiva.

**Confidenza:** è una regola euristica leggibile, non una probabilità calibrata. Il checksum indica soltanto che il numero è formalmente valido; non stabilisce che appartenga al prodotto. Confronta sempre variante e confezione. Un barcode leggibile non garantisce che Yuka abbia il prodotto nel proprio catalogo.

## Struttura

- `apps/web`: React, Vite, TypeScript, JsBarcode
- `apps/api`: Fastify e adapter verso le fonti
- `packages/core`: interpretazione input, checksum, aggregazione, punteggio

## Contributi

MIT. Le fonti e i relativi termini d'uso restano indipendenti da questa licenza. Per nuove fonti, restituisci candidati con URL verificabile e limita timeout e numero dei risultati. Per ampliare l'archivio di coppie verificate, aggiungi solo prodotti con fonti pubbliche che mostrano esplicitamente entrambi gli identificatori.
