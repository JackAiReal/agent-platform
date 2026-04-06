<?php
define('DS', DIRECTORY_SEPARATOR);
define('ROOT', dirname(__FILE__));

include_once(ROOT.DS.'inc'.DS.'OpenTrashmailBackend.class.php');
include_once(ROOT.DS.'inc'.DS.'core.php');

if (!function_exists('loucer_data_root')) {
    function loucer_data_root() {
        return realpath(ROOT.DS.'..'.DS.'data') ?: ROOT.DS.'..'.DS.'data';
    }
}

if (!function_exists('loucer_derived_path')) {
    function loucer_derived_path($email, $id) {
        return loucer_data_root().DS.'.loucer-derived'.DS.strtolower((string)$email).DS.$id.'.json';
    }
}

if (!function_exists('loucer_load_derived')) {
    function loucer_load_derived($email, $id) {
        $path = loucer_derived_path($email, $id);
        if (!file_exists($path)) {
            return null;
        }
        $raw = file_get_contents($path);
        $parsed = json_decode($raw, true);
        return is_array($parsed) ? $parsed : null;
    }
}

if (!function_exists('loucer_attach_derived_to_record')) {
    function loucer_attach_derived_to_record($record) {
        if (!is_array($record)) {
            return $record;
        }
        $email = isset($record['email']) ? $record['email'] : '';
        $id = isset($record['id']) ? $record['id'] : '';
        if (!$email || !$id) {
            return $record;
        }
        $derived = loucer_load_derived($email, $id);
        if ($derived) {
            $record['derived'] = $derived;
        }
        return $record;
    }
}

if (!function_exists('loucer_attach_derived_to_detail')) {
    function loucer_attach_derived_to_detail($email, $id, $emaildata) {
        if (!is_array($emaildata)) {
            return $emaildata;
        }
        $derived = loucer_load_derived($email, $id);
        if ($derived) {
            $emaildata['derived'] = $derived;
        }
        return $emaildata;
    }
}

if (!function_exists('loucer_json_response')) {
    function loucer_json_response($payload, $status = 200) {
        http_response_code($status);
        header('Content-Type: application/json; charset=UTF8');
        exit(json_encode($payload));
    }
}

if (!function_exists('loucer_sort_mail_records_desc')) {
    function loucer_sort_mail_records_desc($records) {
        if(!is_array($records)) {
            return $records;
        }
        if(!empty($records)) {
            krsort($records, SORT_NATURAL);
        }
        return $records;
    }
}

if (!function_exists('loucer_mailbox_activity_ts')) {
    function loucer_mailbox_activity_ts($email) {
        $email = strtolower(trim((string)$email));
        if($email === '') {
            return 0;
        }

        $path = loucer_data_root().DS.$email;
        if(!is_dir($path)) {
            return 0;
        }

        $mtime = @filemtime($path);
        return $mtime ? intval($mtime) : 0;
    }
}

if (!function_exists('loucer_list_sorted_accounts')) {
    function loucer_list_sorted_accounts() {
        $accounts = listEmailAdresses();
        $activityMap = [];
        foreach ($accounts as $email) {
            $activityMap[$email] = loucer_mailbox_activity_ts($email);
        }

        usort($accounts, function ($left, $right) use ($activityMap) {
            $leftRank = $activityMap[$left] ?? 0;
            $rightRank = $activityMap[$right] ?? 0;
            if($leftRank === $rightRank) {
                return strcmp($left, $right);
            }
            return $rightRank <=> $leftRank;
        });

        return $accounts;
    }
}

if (!function_exists('loucer_bridge_base_url')) {
    function loucer_bridge_base_url() {
        $internal = getenv('MAIL_BRIDGE_INTERNAL_BASE');
        if($internal && trim($internal) !== '') {
            return rtrim(trim($internal), '/');
        }
        $configured = getenv('MAIL_BRIDGE_PUBLIC_BASE');
        if($configured && trim($configured) !== '') {
            return rtrim(trim($configured), '/');
        }
        return 'http://mail-bridge:18762';
    }
}

if (!function_exists('loucer_bridge_proxy_request')) {
    function loucer_bridge_proxy_request($method, $path, $payload = null, $settings = []) {
        $headers = [
            'Accept: application/json',
        ];

        $token = trim((string)getenv('MAIL_BRIDGE_TOKEN'));
        if($token !== '') {
            $headers[] = 'Authorization: Bearer '.$token;
        } else if(!empty($settings['ADMIN_PASSWORD'])) {
            $headers[] = 'X-Admin-Password: '.$settings['ADMIN_PASSWORD'];
        } else if(!empty($settings['PASSWORD'])) {
            $headers[] = 'X-Admin-Password: '.$settings['PASSWORD'];
        }

        $content = null;
        if($payload !== null) {
            $headers[] = 'Content-Type: application/json; charset=UTF-8';
            $content = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }

        $context = stream_context_create([
            'http' => [
                'method' => strtoupper((string)$method),
                'header' => implode("\r\n", $headers),
                'content' => $content,
                'ignore_errors' => true,
                'timeout' => 30,
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);

        $raw = @file_get_contents(loucer_bridge_base_url().$path, false, $context);
        $responseHeaders = $http_response_header ?? [];
        $status = 500;
        foreach ($responseHeaders as $headerLine) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $headerLine, $matches)) {
                $status = intval($matches[1]);
                break;
            }
        }

        $decoded = json_decode((string)$raw, true);
        if(!is_array($decoded)) {
            $decoded = [
                'ok' => false,
                'message' => 'bridge_invalid_response',
                'raw' => (string)$raw,
            ];
        }

        return [
            'status' => $status,
            'body' => $decoded,
        ];
    }
}

$url = array_values(array_filter(explode('/', ltrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/'))));
$backend = new OpenTrashmailBackend($url);
$settings = loadSettings();

if($settings['ALLOWED_IPS'])
{
    $ip = getUserIP();
    if(!isIPInRange($ip, $settings['ALLOWED_IPS']))
        exit("当前 IP（$ip）未被允许访问此站点。");
}

if($settings['PASSWORD'] || $settings['ADMIN_PASSWORD'])
    session_start();

if($settings['PASSWORD'])
{
    $pw = $settings['PASSWORD'];
    $auth = false;
    if(isset($_SERVER['HTTP_PWD']) && $_SERVER['HTTP_PWD'] == $pw)
        $auth = true;
    else if(isset($_REQUEST['password']) && $_REQUEST['password'] == $pw)
        $auth = true;
    else if(isset($_SESSION['authenticated']) && $_SESSION['authenticated'] == true)
        $auth = true;
    else if(isset($_REQUEST['password']) && $_REQUEST['password'] !== $settings['PASSWORD'])
        exit($backend->renderTemplate('password.html', [
            'error' => '访问口令错误，请重新输入。',
        ]));

    if($auth===true)
        $_SESSION['authenticated'] = true;
    else
        exit($backend->renderTemplate('password.html'));
}

if(($_SERVER['HTTP_HX_REQUEST'] ?? '') != 'true')
{
    if(count($url)==0 || !file_exists(ROOT.DS.implode('/', $url)))
        if(($url[0] ?? '')!='api' && ($url[0] ?? '')!='rss' && ($url[0] ?? '')!='json')
            exit($backend->renderTemplate('index.html', [
                'url' => implode('/', $url),
                'settings' => loadSettings(),
            ]));
}
else if(count($url)==1 && ($url[0] ?? '') == 'api') {
    exit($backend->renderTemplate('intro.html'));
}

if (($url[0] ?? '') === 'api' && ($url[1] ?? '') === 'address') {
    $email = $_REQUEST['email'] ?: ($url[2] ?? '');
    if(!filter_var($email, FILTER_VALIDATE_EMAIL))
        exit('<h1>Invalid email address</h1>');
    $emails = loucer_sort_mail_records_desc(getEmailsOfEmail($email));
    foreach ($emails as $key => $record) {
        $emails[$key] = loucer_attach_derived_to_record($record);
    }
    exit($backend->renderTemplate('email-table.html', [
        'isadmin' => ($settings['ADMIN'] == $email),
        'email' => $email,
        'emails' => $emails,
        'dateformat' => $settings['DATEFORMAT']
    ]));
}

if (($url[0] ?? '') === 'api' && ($url[1] ?? '') === 'read') {
    $email = $_REQUEST['email'] ?: ($url[2] ?? '');
    $id = $_REQUEST['id'] ?: ($url[3] ?? '');
    if(!filter_var($email, FILTER_VALIDATE_EMAIL))
        exit('<h1>Invalid email address</h1>');
    if(!is_numeric($id))
        exit('<h1>Invalid id</h1>');
    if(!emailIDExists($email,$id))
        exit('<h1>Email not found</h1>');
    $emaildata = getEmail($email, $id);
    $emaildata = loucer_attach_derived_to_detail($email, $id, $emaildata);
    exit($backend->renderTemplate('email.html', [
        'emaildata' => $emaildata,
        'email' => $email,
        'mailid' => $id,
        'dateformat' => $settings['DATEFORMAT']
    ]));
}

if (($url[0] ?? '') === 'json') {
    if (($url[1] ?? '') == 'listaccounts') {
        if($settings['SHOW_ACCOUNT_LIST'] && (($settings['ADMIN_PASSWORD'] != "" && ($_REQUEST['password'] ?? '')==$settings['ADMIN_PASSWORD']) || !$settings['ADMIN_PASSWORD']))
            loucer_json_response(loucer_list_sorted_accounts());
        loucer_json_response(['error' => '403 Forbidden'], 403);
    }

    $email = $url[1] ?? '';
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        loucer_json_response(['error' => 'Email not found'], 404);
    }

    $id = $url[2] ?? '';
    if($id) {
        if(!emailIDExists($email,$id))
            loucer_json_response(['error' => 'Email ID not found'], 404);
        if(!is_numeric($id))
            loucer_json_response(['error' => 'Invalid ID'], 400);
        $emaildata = getEmail($email,$id);
        $emaildata = loucer_attach_derived_to_detail($email, $id, $emaildata);
        loucer_json_response($emaildata);
    }

    $emails = loucer_sort_mail_records_desc(getEmailsOfEmail($email, true, true));
    foreach ($emails as $key => $record) {
        $emails[$key] = loucer_attach_derived_to_record($record);
    }
    loucer_json_response($emails);
}

if (($url[0] ?? '') === 'api' && ($url[1] ?? '') === 'domain-manager') {
    if(empty($_SESSION['admin'])) {
        exit($backend->renderTemplate('intro.html', [
            'error' => '域名管理仅在管理员模式下可用。',
        ]));
    }
    exit($backend->renderTemplate('domain-manager.html', [
        'bridge_base_url' => loucer_bridge_base_url(),
    ]));
}

if (($url[0] ?? '') === 'api' && ($url[1] ?? '') === 'domain-registry') {
    if(empty($_SESSION['admin'])) {
        loucer_json_response(['ok' => false, 'message' => 'forbidden'], 403);
    }

    if(($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && ($url[2] ?? '') === 'save') {
        $rawBody = file_get_contents('php://input');
        $payload = json_decode((string)$rawBody, true);
        $result = loucer_bridge_proxy_request('POST', '/api/admin/domains/save', is_array($payload) ? $payload : [], $settings);
        loucer_json_response($result['body'], $result['status']);
    }

    $result = loucer_bridge_proxy_request('GET', '/api/admin/domains', null, $settings);
    loucer_json_response($result['body'], $result['status']);
}

if (($url[0] ?? '') === 'api' && ($url[1] ?? '') === 'mail-bridge-settings') {
    if(empty($_SESSION['admin'])) {
        loucer_json_response(['ok' => false, 'message' => 'forbidden'], 403);
    }

    if(($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && ($url[2] ?? '') === 'save') {
        $rawBody = file_get_contents('php://input');
        $payload = json_decode((string)$rawBody, true);
        $result = loucer_bridge_proxy_request('POST', '/api/admin/mail-bridge/save', is_array($payload) ? $payload : [], $settings);
        loucer_json_response($result['body'], $result['status']);
    }

    $result = loucer_bridge_proxy_request('GET', '/api/admin/mail-bridge', null, $settings);
    loucer_json_response($result['body'], $result['status']);
}

if (($url[0] ?? '') === 'api' && ($url[1] ?? '') === 'listaccounts') {
    $isAllowed = $settings['SHOW_ACCOUNT_LIST'] && (($settings['ADMIN_PASSWORD'] != "" && !empty($_SESSION['admin'])) || !$settings['ADMIN_PASSWORD']);
    if(!$isAllowed) {
        exit('403 Forbidden');
    }

    $limitQueryValue = $url[2] ?? $_GET['limit'] ?? $_REQUEST['limit'] ?? null;
    if($limitQueryValue === null) {
        $queryString = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_QUERY);
        if($queryString) {
            parse_str($queryString, $queryParams);
            $limitQueryValue = $queryParams['limit'] ?? null;
        }
    }
    $requestedLimit = intval($limitQueryValue ?? 10);
    $limit = max(1, min(50, $requestedLimit > 0 ? $requestedLimit : 10));
    $accounts = loucer_list_sorted_accounts();
    $totalCount = count($accounts);
    $visibleAccounts = array_slice($accounts, 0, $limit);

    exit($backend->renderTemplate('account-list.html', [
        'emails' => $visibleAccounts,
        'dateformat' => $settings['DATEFORMAT'],
        'limit' => $limit,
        'visible_count' => count($visibleAccounts),
        'total_count' => $totalCount,
    ]));
}

$answer = $backend->run();

if($answer === false)
    return false;
else
    echo $answer;
