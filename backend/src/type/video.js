/**
 * video.js - Dinh nghia kieu du lieu (JSDoc typedef) cho module video.
 *
 * File nay dung lam "Single Source of Truth" ve kieu du lieu phia backend.
 * Frontend co file TypeScript tuong duong: frontend/src/type/video.ts
 *
 * Vi backend dung CommonJS (khong co TypeScript), ta dung JSDoc typedef
 * de van co autocomplete va type safety khi viet code voi VS Code / JSDoc.
 */

/**
 * Thong tin metadata co ban cua mot video stream.
 *
 * @typedef {Object} VideoInfo
 * @property {string} title       - Tieu de video hien thi tren giao dien
 * @property {string} description - Mo ta ngan ve noi dung video
 * @property {string} manifestUrl - Duong dan tuong doi toi file DASH manifest (.mpd)
 */

// Module nay khong export gi, chi dung de chua JSDoc typedef
module.exports = {};
