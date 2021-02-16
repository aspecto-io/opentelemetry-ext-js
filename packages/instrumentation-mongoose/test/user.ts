import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    email: string;
    firstName: string;
    lastName: string;
    age: number;
}

const UserSchema: Schema = new Schema({
    email: { type: String, required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    age: { type: Number, required: false },
});

// Export the model and return your IUser interface
const User = mongoose.model<IUser>('User', UserSchema);
export default User;

export const loadUsers = async () => {
    await User.insertMany([
        new User({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@example.com',
            age: 18,
        }),
        new User({
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane.doe@example.com',
            age: 19,
        }),
        new User({
            firstName: 'Michael',
            lastName: 'Fox',
            email: 'michael.fox@example.com',
            age: 16,
        }),
    ]);
    await User.createIndexes();
};
