import fs from 'fs';
import path from 'path';

import shell from 'shelljs';
import { Page } from 'puppeteer';
import Papa from 'papaparse';
import moment from 'moment';
import glob from 'glob';

import { BrowserUtil, log, sleep, getDownloadDir } from '../../util';
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

function expandHomeDir (path_: string) {
  var homedir: string = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'] || '';
  if (!path_) return path_;
  if (path_ == '~') return homedir;
  if (path_.slice(0, 2) != '~/') return path_;
  return path.join(homedir, path_.slice(2));
}


function write_timestamped_file(root_dir_path: string, filename: string, obj: any) {
  root_dir_path = expandHomeDir(root_dir_path)
  const date_str = moment(new Date()).local().format('YYYY-MM-DD_hh-mm')
  const dir_path = path.join(root_dir_path, date_str)
  return write(dir_path, filename, obj)
}

function write(dir_path:string, filename:string, obj:any) {
  if(!fs.existsSync(dir_path))
    // is sync
    shell.mkdir('-p', dir_path);

  const file_path = path.join(dir_path, filename)

  const split = filename.split('.')
  const exten = split[split.length - 1]
  let text = null
  if(exten == 'csv')
    text = Papa.unparse(obj)
  else
    text = JSON.stringify(obj, null, 2)

  fs.writeFileSync(file_path, text)
  return file_path
}

function get_last_timestamped_dir_path(root_dir_path:string) {
  root_dir_path = expandHomeDir(root_dir_path)
  const date_paths = glob.sync(path.join(root_dir_path, '2*'))
  date_paths.sort()
  return date_paths[date_paths.length - 1]
}

function write_to_last_timestamped_dir(root_dir_path: string, filename:string, obj:any) {
  write(get_last_timestamped_dir_path(root_dir_path), filename, obj)
}


export default class Etrade implements Account {
    private static DISPLAY_NAME = 'Etrade';
    public displayName = Etrade.DISPLAY_NAME;

    public async getLedger(page: Page): Promise<Ledger> {
        log.title('Fetching Etrade Ledger');
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36');
        await this.login(page);
        await page.screenshot({path: 'login.png'});
        await this.downloadTransactions(page);
        log.succeed('transactions downloaded');
        let balance = await this.getBalance(page);
        log.succeed('got balance');
        log.line('');
        return new Ledger(balance, []);
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
        log.succeed('downloading transactions...')

        await page.goto(
            'https://us.etrade.com/e/t/accounts/txnhistory?TXN=AccountTrans&ploc=2017-nav-Accounts'
        )

        const transaction_rows = await page.evaluate(() => {
            const transaction_rows = []
            let trs = document.querySelectorAll('table.tBorder tr')
            for(let irow = 0; irow < trs.length; irow++) {
                const tds = trs[irow].querySelectorAll('td')
                if(tds.length != 4)
                    continue
                const transaction_row: string[] = []
                transaction_rows.push(transaction_row)
                for(let icol = 0; icol < tds.length; icol++) {
                    const text = tds[icol].textContent || ''
                    transaction_row.push(text.trim())
                }
            }

            return transaction_rows
        });

        write_timestamped_file('~/etrade-data', 'transactions.json', transaction_rows);
        log.succeed('downloaded transactions')
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
