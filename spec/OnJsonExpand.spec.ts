import {TestApplication} from './TestApplication';
import {DataContext} from '../index';
import {resolve} from 'path';
import {beforeExecute} from '../OnJsonExpand';


describe('OnJsonExpand', () => {
    let app: TestApplication;
    let context: DataContext;
    beforeAll((done) => {
        app = new TestApplication(resolve(__dirname, 'test2'));
        context = app.createContext();
        return done();
    });
    afterAll(async () => {
        await context.finalizeAsync();
        await app.finalize();
    });
    it('should expand parent items', async () => {
        const Users = context.model('User').on('before.execute', beforeExecute);
        context.setUser({
            name: 'alexis.rees@example.com'
        });
        let user = await Users.asQueryable().where((x:{ name: string }) => {
            return x.name === 'james.may@example.com';
        }).expand((x: any) => x.groups).getItem();
        expect(user).toBeTruthy();
        expect(Array.isArray(user.groups)).toBeTruthy();
        // set context user
        context.setUser({
            name: 'james.may@example.com'
        });
        user = await Users.where((x:{ name: string }) => {
            return x.name === 'alexis.rees@example.com';
        }).expand((x: any) => x.groups).getItem();
        expect(user).toBeFalsy();
        user = await Users.where((x:{ name: string }) => {
            return x.name === 'james.may@example.com';
        }).expand((x: any) => x.groups).getItem();
        expect(user).toBeTruthy();
        expect(Array.isArray(user.groups)).toBeTruthy();
    });

    it('should expand parent items with expression', async () => {
        const Users = context.model('User').on('before.execute', beforeExecute);
        context.setUser({
            name: 'alexis.rees@example.com'
        });
        const q =await Users.filterAsync({
            '$filter': 'name eq \'james.may@example.com\'',
            '$expand': 'groups($select=name)'
        });
        let user = await q.getItem();
        expect(user).toBeTruthy();
        expect(Array.isArray(user.groups)).toBeTruthy();
        const [group] = user.groups;
        const keys = Object.keys(group);
        expect(keys.length).toBe(1);
        expect(keys[0]).toBe('name');
    });

    it('should get child items without auto expand', async () => {
        const Groups = context.model('Group');
        context.setUser({
            name: 'alexis.rees@example.com'
        });
        const q =await Groups.filterAsync({
            '$filter': 'name eq \'Users\'',
            '$expand': 'members($select=name)'
        });
        let group = await q.getItem();
        expect(group).toBeTruthy();
        expect(Array.isArray(group.members)).toBeTruthy();
        const [user] = group.members;
        const keys = Object.keys(user);
        expect(keys.length).toBe(2);
    });

    it('should expand child items with expression', async () => {
        const Groups = context.model('Group').on('before.execute', beforeExecute);
        context.setUser({
            name: 'alexis.rees@example.com'
        });
        const q =await Groups.filterAsync({
            '$filter': 'name eq \'Users\'',
            '$expand': 'members($select=name)'
        });
        let group = await q.getItem();
        expect(group).toBeTruthy();
        expect(Array.isArray(group.members)).toBeTruthy();
        const [user] = group.members;
        const keys = Object.keys(user);
        expect(keys.length).toBe(1);
        expect(keys[0]).toBe('name');
    });

    it('should expand associated items without auto expand', async () => {
        const Orders = context.model('Order');
        context.setUser({
            name: 'alexis.rees@example.com'
        });
        const q =await Orders.filterAsync({
            '$filter': 'orderedItem/name eq \'Alienware 17\'',
            '$expand': 'customer'
        });
        let orders = await q.getItems();
        expect(Array.isArray(orders)).toBeTruthy();
    });

    it('should expand associated items without auto expand', async () => {
        const Orders = context.model('Order');
        context.setUser({
            name: 'alexis.rees@example.com'
        });
        const q =await Orders.filterAsync({
            '$filter': 'orderedItem/name eq \'Alienware 17\'',
            '$expand': 'customer'
        });
        let orders = await q.getItems();
        expect(Array.isArray(orders)).toBeTruthy();
    });

    it('should expand associated items with expression', async () => {
        const Orders = context.model('Order').on('before.execute', beforeExecute);
        context.setUser({
            name: 'alexis.rees@example.com'
        });
        const q =await Orders.filterAsync({
            '$filter': 'orderedItem/name eq \'Alienware 17\'',
            '$expand': 'customer,orderedItem'
        });
        let orders = await q.getItems();
        expect(Array.isArray(orders)).toBeTruthy();
    });


});