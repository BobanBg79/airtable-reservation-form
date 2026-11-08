// A fake SQL client for tests (not a route: files starting with "_" in api/ are helpers). It records every
// query and answers from a list of [fragment of the SQL, rows or a function returning rows]; the first
// entry whose fragment appears in the query text wins. `transaction` runs the queries it is given, in order.
export function fakeSql(answers = []) {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      for (const [fragment, rows] of answers) {
        if (text.includes(fragment)) return typeof rows === 'function' ? rows(text, params) : rows;
      }
      return [];
    },
    async transaction(queries) {
      return Promise.all(queries);
    },
    /** The recorded calls whose text contains `fragment`. */
    callsTo(fragment) {
      return calls.filter((c) => c.text.includes(fragment));
    },
  };
}

/** A minimal response object with Vercel's helpers (status, json, setHeader). */
export function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      res.headers[name] = value;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    },
  };
  return res;
}
