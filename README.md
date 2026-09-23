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

Queste fonti possono essere temporaneamente indisponibili o restituire dati incompleti. L'API raccoglie le risposte in parallelo e mostra le fonti che non hanno risposto. Nessuna chiave API va inserita nella web app.

**ASIN:** Barcode Lookup documenta una ricerca diretta per ASIN, ma richiede una chiave API e non garantisce di trovare ogni prodotto. I cataloghi gratuiti non garantiscono un collegamento diretto ASIN → GTIN. Per cercare in modo utile, aggiungi nel campo facoltativo il nome preciso, la marca e il formato del prodotto. Una corrispondenza testuale resta una candidata: controlla le fonti e la variante. Il progetto non estrae dati direttamente da Amazon. L'esempio `B09SY5QHHJ` precompila un suggerimento di ricerca, non un EAN o una prova di associazione.

**Confidenza:** è una regola euristica leggibile, non una probabilità calibrata. Il checksum indica soltanto che il numero è formalmente valido; non stabilisce che appartenga al prodotto. Confronta sempre variante e confezione. Un barcode leggibile non garantisce che Yuka abbia il prodotto nel proprio catalogo.

## Struttura

- `apps/web`: React, Vite, TypeScript, JsBarcode
- `apps/api`: Fastify e adapter verso le fonti
- `packages/core`: interpretazione input, checksum, aggregazione, punteggio

## Contributi

MIT. Le fonti e i relativi termini d'uso restano indipendenti da questa licenza. Per nuove fonti, restituisci candidati con URL verificabile e limita timeout e numero dei risultati. Apri una issue o una pull request quando il repository sarà pubblicato.
