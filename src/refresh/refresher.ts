import { Account, Ledger } from '../account';
import { BrowserUtil, log } from '../util';

export type RefreshResults = {
    data: Map<Account, Ledger>,
    errors: Map<Account, any>
}

export default class Refresher {
    static async refresh(accounts: Account[]): Promise<RefreshResults> {
        let browser = await BrowserUtil.newBrowser();
        let page = await BrowserUtil.newPage(browser);
        
        let data = new Map<Account, Ledger>();
        let errors = new Map<Account, any>();
        
        for (var account of accounts) {
            try {
                let ledger = await account.getLedger(page);
                data.set(account, ledger);
            }
            catch(e) {
                errors.set(account, e);
                
            }
        }

        await browser.close();
        return {data, errors};
    }
}