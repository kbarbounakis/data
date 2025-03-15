import { TestApplication2 } from './TestApplication';
import { DataContext } from 'types';
import { executeInUnattendedModeAsync } from '../UnattendedMode';
import { OnBeforeExpandListener } from '../OnBeforeExpandListener';
import { SqlFormatter } from '@themost/query';


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
            const items = await context.model('Order').on('before.execute', (event, callback) => {
                //return callback();
                return new OnBeforeExpandListener().beforeExecute(event, callback);
            }).where((x: any) => {
                return x.orderStatus.alternateName === 'OrderPickup';
            }).expand((x: any) => x.orderStatus).take(25).getItems();
            expect(items.length).toBeTruthy();
        })
    });


});