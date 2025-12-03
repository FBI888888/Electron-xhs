const crypto = require("crypto");
const lookup = ["Z", "m", "s", "e", "r", "b", "B", "o", "H", "Q", "t", "N", "P", "+", "w", "O", "c", "z", "a", "/", "L", "p", "n", "g", "G", "8", "y", "J", "q", "4", "2", "K", "W", "Y", "j", "0", "D", "S", "f", "d", "i", "k", "x", "3", "V", "T", "1", "6", "I", "l", "U", "A", "F", "M", "9", "7", "h", "E", "C", "v", "u", "R", "X", "5"]
// require("./b1")

function MD5(res) {
    return crypto.createHash('md5').update(res).digest('hex');
}

function encodeChunk(e, t, n) {
    for (var r, o = [], i = t; i < n; i += 3)
        r = (e[i] << 16 & 16711680) + (e[i + 1] << 8 & 65280) + (255 & e[i + 2]),
            o.push(tripletToBase64(r));
    return o.join("")
}

function tripletToBase64(e) {
    return lookup[e >> 18 & 63] + lookup[e >> 12 & 63] + lookup[e >> 6 & 63] + lookup[63 & e]
}

function encrypt_sign(e, t) {
    var n = "A4NjFqYu5wPHsO0XTdDgMa2r1ZQocVte9UJBvk6/7=yRnhISGKblCWi+LpfE8xzm3"
        , r = "test"
        , o = (new Date).getTime()
    var a = "[object Object]" === Object.prototype.toString.call(t) || "[object Array]" === Object.prototype.toString.call(t);
    return {
        "X-s": function (e) {
            var t, r, o, i, a, s, l, c = "", u = 0;
            for (e = function (e) {
                e = e.replace(/\r\n/g, "\n");
                for (var t = "", n = 0; n < e.length; n++) {
                    var r = e.charCodeAt(n);
                    r < 128 ? t += String.fromCharCode(r) : r > 127 && r < 2048 ? (t += String.fromCharCode(r >> 6 | 192),
                        t += String.fromCharCode(63 & r | 128)) : (t += String.fromCharCode(r >> 12 | 224),
                        t += String.fromCharCode(r >> 6 & 63 | 128),
                        t += String.fromCharCode(63 & r | 128))
                }
                return t
            }(e); u < e.length;)
                i = (t = e.charCodeAt(u++)) >> 2,
                    a = (3 & t) << 4 | (r = e.charCodeAt(u++)) >> 4,
                    s = (15 & r) << 2 | (o = e.charCodeAt(u++)) >> 6,
                    l = 63 & o,
                    isNaN(r) ? s = l = 64 : isNaN(o) && (l = 64),
                    c = c + n.charAt(i) + n.charAt(a) + n.charAt(s) + n.charAt(l);
            return c
        }(MD5([o, r, e, a ? JSON.stringify(t) : ""].join(""))),
        "X-t": o
    }
}

function encodeUtf8(e) {
    for (var t = encodeURIComponent(e), n = [], r = 0; r < t.length; r++) {
        var o = t.charAt(r);
        if ("%" === o) {
            var i = t.charAt(r + 1) + t.charAt(r + 2)
                , a = parseInt(i, 16);
            n.push(a),
                r += 2
        } else
            n.push(o.charCodeAt(0))
    }
    return n
}

function b64Encode(e) {
    for (var t, n = e.length, r = n % 3, o = [], i = 16383, a = 0, s = n - r; a < s; a += i)
        o.push(encodeChunk(e, a, a + i > s ? s : a + i));
    return 1 === r ? (t = e[n - 1],
        o.push(lookup[t >> 2] + lookup[t << 4 & 63] + "==")) : 2 === r && (t = (e[n - 2] << 8) + e[n - 1],
        o.push(lookup[t >> 10] + lookup[t >> 4 & 63] + lookup[t << 2 & 63] + "=")),
        o.join("")
}

var mcr = function (e) {
    for (var t, n, r = 3988292384, o = 256, i = []; o--; i[o] = t >>> 0)
        for (n = 8,
                 t = o; n--;)
            t = 1 & t ? t >>> 1 ^ r : t >>> 1;
    return function (e) {
        if ("string" == typeof e) {
            for (var t = 0, n = -1; t < e.length; ++t)
                n = i[255 & n ^ e.charCodeAt(t)] ^ n >>> 8;
            return ~n ^ r
        }
        for (t = 0,
                 n = -1; t < e.length; ++t)
            n = i[255 & n ^ e[t]] ^ n >>> 8;
        return ~n ^ r
    }
}()

function xsCommon(a1) {
    try {
        //window.localStorage.getItem("b1")
        var u = "I38rHdgsjopgIvesdVwgIC+oIELmBZ5e3VwXLgFTIxS3bqwErFeexd0ekncAzMFYnqthIhJeSBMDKutRI3KsYorWHPtGrbV0P9WfIi/eWc6eYqtyQApPI37ekmR6QL+5Ii6sdneeSfqYHqwl2qt5B0DBIx+PGDi/sVtkIxdsxuwr4qtiIhuaIE3e3LV0I3VTIC7e0utl2ADmsLveDSKsSPw5IEvsiVtJOqw8BuwfPpdeTFWOIx4TIiu6ZPwrPut5IvlaLbgs3qtxIxes1VwHIkumIkIyejgsY/WTge7eSqte/D7sDcpipedeYrDtIC6eDVw2IENsSqtlnlSuNjVtIvoekqt3cZ7sVo4gIESyIhE2HfquIxhnqz8gIkIfoqwkICqWJ73sdlOeVPw3IvAe0fgedfVtIi5s3IcA2utAIiKsidvekZNeTPt4nAOeWPwEIvkLcA0eSuwuLB/sDqweI3RrIxE5Luwwaqw+rekhZANe1MNe0PwjIveskDoeSmrvIiAsfI/sxBidIkve3PwlIhQk2VtqOqt1IxesTVtjIk0siqwdIh/sjut3wutnsPw5ICclI3l4wA4jwIAsWVw4IE4qIhOsSqtZBbTt/A0ejjp1IkGPGutKoqw3I3OexqtYQL5eicAs3phwIhos3BOs3utscPwaICJsWPwUIigekeqLIxKsSedsSuwFIv3eiqt5Q0ioI3RPIx0ekl5s306sWjJe1qwMICQqIEqmqqw9IiHKIxOeSe88pMKeiVw6IxHIqPwmodveVANsxVtNaVtcI3PiIhp2mutyrqwHI3OsfI6e1uwmpqtnIhSNbutlIxcrm/c9Ii/sfdosS9geVPwttPtNIiVcI3AsfqtYIEAe0SYxIv+aez8GIvpBICde1PwSaqtz+qtMIkPIIhes3AAe6PwlprFMICF4yqtmZVtQIxDwI38ZIi+fIh/e3rvskbkUwVwGIvI68PwaoqwMIE3ekfPkIkZf/B7eDVtpHPtW+AiieduWIkMkguwRIx6sWeY9IxQMPuwqI3MeQPtSrPtWIEP6IvzlICzgZPwDIiLKIhosxuw6sjmFIEG4IC6sfn3s3qwXIv4BIELEalIYIvMS/lh4Ihes0L0eDqwJIE3sxqtwICWgIC/sSuw4Iv+bQqwlIC/sklWmpqteePtPIv6eYqtoIhAsS9bYIE5sDrKsVPtew00s0VwHoMdsfVt4IxesiYKeTVtoIhH3IkTvePwNObRtI36sduwsr/ee6SM7",
            p = {
                s0: 5,
                s1: "",
                x0: "1",
                x1: "4.1.4",
                x2: "Windows",
                x3: "ratlin-shell",
                x4: "0.0.971",
                x5: a1,
                x6: "",
                x7: "",
                x8: u,
                x9: mcr(u),
                x10: 0,
                x11: "lite"
            }
        return b64Encode(encodeUtf8(JSON.stringify(p)))
    } catch (v) {
    }
    return null
}

function headers(url, body, a1) {
    // document.cookie = "a1=" + a1;
    url = new URL(url);
    let x1_data = url.pathname;
    if (url.searchParams.size > 0) {
        x1_data += url.search;
    }
    if (body !== null && body !== undefined && body !== "") {
        try {
            body = JSON.stringify(JSON.parse(body));
        } catch (e) {
            body = JSON.stringify(body)
        } finally {
            x1_data = x1_data.concat(body)
        }
    }
    // window.xhsFingerprintV3.getCurMiniUa(); //如果说需要使用动态的b1生成，则把b1js文件导入，然后调用这个函数，最后在通过window.localStorage.getItem("b1")来获取b1
    const sign = encrypt_sign(x1_data);
    return {
        "X-S-Common": xsCommon(a1),
        "X-S": sign["X-s"],
        "X-T": sign["X-t"].toString(),
    }
}
