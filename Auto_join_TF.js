/*

Time update：2024.03.19 11:25
Update：Tối ưu script, sửa lỗi, sửa cơ chế gỡ bỏ APP_ID không hợp lệ (chỉ gỡ bỏ khi link sai）

Surge conf
https://raw.githubusercontent.com/githubdulong/Script/master/Surge/autotf.sgmodule
Boxjs Register
https://raw.githubusercontent.com/githubdulong/Script/master/boxjs.json

*/

if (typeof $request !== 'undefined' && $request) {
    let url = $request.url;

    if (/^https:\/\/testflight\.apple\.com\/v3\/accounts\/.*\/apps$/.test(url)) {
        let headers = Object.fromEntries(Object.entries($request.headers).map(([key, value]) => [key.toLowerCase(), value]));
        let session_id = headers['x-session-id'];
        let session_digest = headers['x-session-digest'];
        let request_id = headers['x-request-id'];

        $persistentStore.write(session_id, 'session_id');
        $persistentStore.write(session_digest, 'session_digest');
        $persistentStore.write(request_id, 'request_id');

        $notification.post('Thông tin thu được thành công', 'Vui lòng lấy APP_ID Sau khi chỉnh sửa các tham số, tắt tập lệnh', '');
        console.log(`Thông tin thu được thành công: session_id=${session_id}, session_digest=${session_digest}, request_id=${request_id}`);
    } else if (/^https:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)$/.test(url)) {
        const appIdMatch = url.match(/^https:\/\/testflight\.apple\.com\/join\/([A-Za-z0-9]+)$/);
        if (appIdMatch && appIdMatch[1]) {
            let appId = appIdMatch[1];
            let existingAppIds = $persistentStore.read('APP_ID');
            let appIdSet = new Set(existingAppIds ? existingAppIds.split(',') : []);
            if (!appIdSet.has(appId)) {
                appIdSet.add(appId);
                $persistentStore.write(Array.from(appIdSet).join(','), 'APP_ID');
                $notification.post('Đã chụp APP_ID', '', `Chụp và lưu trữ APP_ID: ${appId}`);
                console.log(`Lấy và lưu trữ APP_ID: ${appId}`);
            } else {
                $notification.post('APP_ID Lặp lại', '', `APP_ID: ${appId} Đã tồn tại rồi, không cần thêm lại.`);
                console.log(`APP_ID: ${appId} Nó đã tồn tại rồi, không cần thêm lại.`);
            }
        } else {
            console.log('Không có cái nào hợp lệ được chụp TestFlight APP_ID');
        }
    }

    $done({});
} else {
    !(async () => {
        let ids = $persistentStore.read('APP_ID');
        if (!ids) {
            console.log('Không phát hiện APP_ID');
            $done();
        } else {
            ids = ids.split(',');
            for await (const ID of ids) {
                await autoPost(ID, ids);
            }
            if (ids.length === 0) {
                $notification.post('Tất cả TestFlight đã được thêm 🎉', 'Mô-đun này đã được tự động đóng', '');
                $done($httpAPI('POST', '/v1/modules', {'Giám sát Beta Puplic': false}));
            } else {
                $done();
            }
        }
    })();
}

async function autoPost(ID, ids) {
    let Key = $persistentStore.read('key');
    let testUrl = https://testflight.apple.com/v3/accounts/${Key}/ru/apps$;
    let header = {
        'X-Session-Id': $persistentStore.read('session_id'),
        'X-Session-Digest': $persistentStore.read('session_digest'),
        'X-Request-Id': $persistentStore.read('request_id')
    };

    return new Promise(resolve => {
        $httpClient.get({url: testurl + ID, headers: header}, (error, response, data) => {
            if (error) {
                console.log(`${ID} Yêu cầu mạng không thành công: ${error}，Lưu trữ APP_ID`);
                resolve();
                return;
            }

            if (response.status !== 200) {
                console.log(`${ID} Không phải là một liên kết hợp lệ: Mã trạng thái ${response.status}，Xoá APP_ID`);
                ids.splice(ids.indexOf(ID), 1);
                $persistentStore.write(ids.join(','), 'APP_ID');
                $notification.post('Không phải là liên kết TestFlight hợp lệ', '', `${ID} Đã xoá`);
                resolve();
                return;
            }

            let jsonData;
            try {
                jsonData = JSON.parse(data);
            } catch (parseError) {
                console.log(`${ID} Phân tích phản hồi không thành công: ${parseError}，Lưu trữ APP_ID`);
                resolve();
                return;
            }

            if (!jsonData || !jsonData.data) {
                console.log(`${ID} Không thể chấp nhận lời mời，Lưu trữ APP_ID`);
                resolve();
                return;
            }

            if (jsonData.data.status === 'FULL') {
                console.log(`${ID} Bản Beta này đã đầy，Lưu trữ APP_ID`);
                resolve();
                return;
            }

            $httpClient.post({url: testurl + ID + '/accept', headers: header}, (error, response, body) => {
                if (!error && response.status === 200) {
                    let jsonBody;
                    try {
                        jsonBody = JSON.parse(body);
                    } catch (parseError) {
                        console.log(`${ID} Phân tích phản hồi yêu cầu tham gia không thành công: ${parseError}，Lưu trữ APP_ID`);
                        resolve();
                        return;
                    }

                    console.log(`${jsonBody.data.name} Đã tham gia TestFlight thành công`);
                    ids.splice(ids.indexOf(ID), 1);
                    $persistentStore.write(ids.join(','), 'APP_ID');
                    if (ids.length > 0) {
                        $notification.post(jsonBody.data.name + ' Đã tham gia TestFlight thành công', '', `Tiếp tục thực hiện APP ID：${ids.join(',')}`);
                    } else {
                        $notification.post(jsonBody.data.name + ' Đã tham gia TestFlight thành công', '', 'Tất cả APP ID đã được xử lý');
                    }
                } else {
                    console.log(`${ID} Không thể tham gia: ${error || `Mã trạng thái ${response.status}`}，Lưu trữ APP_ID`);
                }
                resolve();
            });
        });
    });
}
