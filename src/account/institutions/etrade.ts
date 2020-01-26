import path from 'path';
import shell from 'shelljs';

import { BrowserUtil, log, sleep, getDownloadDir } from '../../util';
import { Page } from 'puppeteer';
import Account from '../account';
import Ledger from '../ledger';

const html = `<html style="font-family: monospace;">
    <head><style>
        html, body{ margin: 0; padding: 0; }
        div { padding: 10px; }
        button { font-family: monospace; }
    </style>
    </head>
    <body style="display: flex; width: 100vw; height: 100vh; align-items: center; justify-content: center;">
        <div>
            <div style="text-align: center;">Enter VIP Token</div>
            <div><input type="password"></div>
            <div><button type="button" onclick="continueLogin(document.querySelector('input').value);">Continue to Etrade</button></div>
        </div>
        <script>setTimeout( () => document.querySelector('input').focus(), 500 );</script>
    </body>
</html>`;

export default class Etrade implements Account {
    private static DISPLAY_NAME = 'Etrade';
    public displayName = Etrade.DISPLAY_NAME;

    public async getLedger(page: Page): Promise<Ledger> {
        log.title('Fetching Etrade Ledger');
        await this.removeOldTransactionFiles();
        await this.login(page);
        let balance = await this.getBalance(page);
        await this.downloadTransactions(page);
        let ledger = await this.parseTransactions();
        log.line('');
        return new Ledger(balance, []);
    }

    private async removeOldTransactionFiles(): Promise<void> {
        const globName = path.join(getDownloadDir(), 'DownloadTxnHistory.csv');
        log.start(`rm -rf ${globName}`);
        shell.rm('-rf', globName);
        log.succeed(`rm -rf ${globName}`);
    }

    private async login(page: Page): Promise<void> {
        const pageUrl = 'https://us.etrade.com/e/t/user/login';

        const usernameSelector = 'input#user_orig';
        const passwordSelector = 'input[type=password]';
        const submitSelector = 'button#logon_button';

        const username = process.env.ETRADE_USER;
        const password = process.env.ETRADE_PW;

        if (username === undefined || password === undefined) {
            throw new Error(
                'Missing Etrade credentials.  Make sure ETRADE_USER and ETRADE_PW environment variables are set.'
            );
        }

        // let pw = `${password}${await this.getVipToken(page)}`;

        await BrowserUtil.simpleLogin(page, pageUrl, username, password, usernameSelector, passwordSelector, submitSelector);
    }

    async getBalance(page: Page): Promise<number> {
        log.start('extracting balance');
        let elSelector = '.text-right.accountvalues-data.accountvalues-data-header.ng-binding';
        let balanceStr = await page.$eval(elSelector, el => el.textContent);
        balanceStr = balanceStr || '';
        let balance = Number(balanceStr.replace(/[^0-9.-]+/g, ''));
        log.succeed('balance loaded');
        return balance;
    }

    async downloadTransactions(page: Page): Promise<void> {
        await page.goto('https://us.etrade.com/e/t/invest/downloadofxtransactions?fp=TH');
        log.line('waiting for downloading link')
        await page.waitForSelector('input[value="msexcel"]', {visible: true})
        await page.click('input[value="msexcel"]')
        log.line('clicked excel')
        await page.waitForSelector('input[alt="Download"]', {visible: true})
        await page.click('input[alt="Download"]')
        log.line('clicked download')
        await sleep(1000)
    }

    async getVipToken(page: Page): Promise<string> {
        await page.setContent(html, { waitUntil: 'networkidle2' });
        return await new Promise<string>(resolve => {
            page.exposeFunction('continueLogin', (vipToken: string) => {
                resolve(vipToken);
            });
        });
    }
}
