/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  aiMock.js
  Mock of the Anthropic Messages API for validators of AI-dependent rules, so that validation neither depends on nor pays for an external, nondeterministic service. A validator lists, in its aiMock property, one scripted response per expected request, in order. A response is one of:
    {confidences: [[substring, confidence], ...], default, omit: [substring, ...], format}: an answer classifying each element sent, with the confidence of the first pair whose substring its text contains, else default (0 if omitted), except the elements whose texts contain a substring in omit, which the answer leaves out, as models sometimes do. With format 'pretty' the JSON array follows a sentence and is spread over lines; otherwise it is compact. In both formats, confidences of 0 and 1 are written as integers.
    {error: message}: an API error with that message.
    {malformed: true}: an answer without a JSON array.
    {disconnect: true}: a closed connection without a response.
  A request beyond the script gets an API error. The rule under test reaches the mock because the validator sets ANTHROPIC_BASE_URL to its address.
*/

// IMPORTS

const http = require('http');

// FUNCTIONS

// Returns the elements sent in a request body.
const getEntries = body => {
  const prompt = JSON.parse(body).messages[0].content;
  return JSON.parse(prompt.slice(prompt.indexOf('Elements:\n') + 'Elements:\n'.length));
};
// Returns the text of an answer classifying elements as scripted.
const getAnswerText = (entries, {confidences = [], default: fallback = 0, omit = [], format}) => {
  const classifications = entries
  .filter(({text}) => ! omit.some(substring => text.includes(substring)))
  .map(({index, text}) => {
    const pair = confidences.find(([substring]) => text.includes(substring));
    return {index, confidence: pair ? pair[1] : fallback};
  });
  // If the answer is to be pretty, spread it over lines, as models often do.
  if (format === 'pretty') {
    return `Here are the classifications:\n${JSON.stringify(classifications, null, 2)}`;
  }
  return JSON.stringify(classifications);
};
// Starts a mock server and returns its URL, a list of the elements of each request, and a function to stop it.
exports.startAIMock = async script => {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      const entries = getEntries(body);
      requests.push(entries);
      const response = script[requests.length - 1];
      const sendJSON = (status, object) => {
        res.writeHead(status, {'content-type': 'application/json'});
        res.end(JSON.stringify(object));
      };
      const sendError = message => sendJSON(400, {
        type: 'error', error: {type: 'invalid_request_error', message}
      });
      const sendText = text => sendJSON(200, {
        content: [{type: 'text', text}], usage: {input_tokens: body.length, output_tokens: text.length}
      });
      // If the script has no response for this request:
      if (! response) {
        sendError(`No scripted response for request ${requests.length}`);
      }
      else if (response.disconnect) {
        req.socket.destroy();
      }
      else if (response.error) {
        sendError(response.error);
      }
      else if (response.malformed) {
        sendText('I cannot classify these elements.');
      }
      else {
        sendText(getAnswerText(entries, response));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    stop: () => new Promise(resolve => server.close(resolve))
  };
};
