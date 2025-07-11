import { TestApplication2 } from './TestApplication';
import {DataContext, DataEventArgs} from 'types';
import {DataModel, executeInUnattendedModeAsync} from '@themost/data';
import { OnBeforeExpandListener } from '../OnBeforeExpandListener';
import {SyncSubscription} from '@themost/events';

describe('OnBeforeExpandListener', () => {
    let app: TestApplication2;
    let context: DataContext;
    beforeAll((done) => {
        app = new TestApplication2();
        context = app.createContext();
        return done();
    });
    afterAll(async () => {
        await context.finalizeAsync();
        await app.finalize();
    })
    it('should use listener', async () => {
        await executeInUnattendedModeAsync(context, async () => {
            const items = await context.model('Order').on('before.execute', (event: DataEventArgs, callback: (err?: Error) => void) => {
                //return callback();
                return new OnBeforeExpandListener().beforeExecute(event, callback);
            }).where((x: any) => {
                return x.orderStatus.alternateName === 'OrderPickup';
            }).expand((x: any) => x.orderStatus).take(25).getItems();
            expect(items.length).toBeTruthy();
        })
    });


});