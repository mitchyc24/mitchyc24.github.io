/* QR rendering. Wraps qrcode-generator (vendored) and emits inline SVG so the
 * code stays crisp on a 4K TV and needs no image decode.
 *
 * Error correction level M with a quiet zone of 4 modules — a phone camera
 * three metres from a TV wants the margin more than it wants density.
 */

export function qrSvg(text, opts) {
  const o = opts || {};
  const margin = o.margin === undefined ? 4 : o.margin;
  const dark = o.dark || '#000000';
  const light = o.light || '#ffffff';

  // Type 0 = auto-select the smallest version that fits.
  const qr = window.qrcode(0, o.ec || 'M');
  qr.addData(text);
  qr.make();

  const n = qr.getModuleCount();
  const size = n + margin * 2;

  let path = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!qr.isDark(row, col)) continue;
      path += 'M' + (col + margin) + ',' + (row + margin) + 'h1v1h-1z';
    }
  }

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" ' +
    'shape-rendering="crispEdges" role="img" aria-label="QR code to join the game">' +
    '<rect width="' + size + '" height="' + size + '" fill="' + light + '"/>' +
    '<path d="' + path + '" fill="' + dark + '"/>' +
    '</svg>'
  );
}
